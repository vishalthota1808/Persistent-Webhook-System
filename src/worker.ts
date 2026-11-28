//Here, a PostgreSQL database already has a row-lock mechanism in which one particular operation locks a particular row and can only release the lock after that particular transaction finishes. So, here in our project, if a worker A starts a transaction on a particular row, it locks the row and continues with its transaction. Whereas, at the same time, if worker B also tries to use the same particular row, then it waits for the worker A to complete its transaction. so, we use here SKIP LOCKED keyword, which enables worker B to directly skip it and move to other row.

import { pool } from "./db/pool.js";
import { LEASE_SECONDS , REQUEST_TIMEOUT_MS, POLL_INTERVAL_MS, RETRY_BASE_MS, RETRY_CAP_MS} from "./config/index.js";
import { date } from "zod";

export async function claimDelivery() { //its func is just to claim a delivery not to send a http request..
    
    const client = await pool.connect();
    
    try {
      await client.query("BEGIN"); //begin the transaction
    
      const result = await client.query( //pick the req row
        `SELECT id
         FROM deliveries
         WHERE status = 'pending'
           AND next_attempt_at <= now()
         ORDER BY next_attempt_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      ); 
    
      if (result.rows.length === 0) { //no pending deliveries
        await client.query("COMMIT");
        return null;
      }
    
      const id = result.rows[0].id; //grabbing the id
    
      const updateResult = await client.query( //update the selected row
        `UPDATE deliveries
         SET status = 'in_flight',
             locked_until = now() + make_interval(secs => $2),
             attempt_count = attempt_count + 1
         WHERE id = $1
         RETURNING *`,
        [id, LEASE_SECONDS]
      );
    
      await client.query("COMMIT"); //end the transaction
    
      const delivery = updateResult.rows[0];
    
      return delivery;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
}

export function computeRetryDelayMs( //this is a function to calculate the exponential jitter delay. baseMs is the base[coeffiecient] of the exponential function and capMs is the base of the exponent and the maximum allowed delay, attempt count is the power of the exponent.
    attemptCount: number,
    { baseMs, capMs }: { baseMs: number; capMs: number },
    rng = Math.random
): number {

    const ceiling = Math.min(
        capMs,
        baseMs * Math.pow(2, attemptCount - 1)
    );

    return Math.floor(rng() * ceiling); //here rng is just a random value to provide jitter instead of direct exponential delays.
}

export async function processDelivery(delivery : any, attempt_count: number) {
    let elapsedTime: any = null;
    let response: any = null;
    let errorMessage: any = null;
    let attemptRecord: any = null;
    try{

        const result = await pool.query(
        `SELECT
            d.*,
            ep.url,
            ep.secret,
            e.type,
            e.payload,
            e.created_at
        FROM deliveries d
        INNER JOIN endpoints ep ON d.endpoint_id = ep.id
        INNER JOIN events e ON d.event_id = e.id
        WHERE d.id = $1`,
        [delivery.id]
        ); //joining three tables deliveries , endpoints, events using appropritate foreign keys relationships and retrieving endpoint url, secret, paylod
    
        const deliveryData = result.rows[0];
    
        if (!deliveryData) {
        throw new Error("Delivery, endpoint, or event data not found");
        }
    
        const payload = { //creating a body to send to req endpoint
            type: deliveryData.type,
            timestamp: deliveryData.created_at,
            data: deliveryData.payload,
            };

        const startTime = Date.now();
        attemptRecord = await pool.query(`INSERT INTO attempts (delivery_id) VALUES ($1) RETURNING id`, [deliveryData.id])
        response = await fetch(deliveryData.url, { //POST request to requrired endpoint
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), //this is for our Request time out
        redirect: "manual",
        });
        elapsedTime = Date.now() - startTime;
    
        //here above the redirect is one of the response from http with 3xx status code where it responds to redirect the current request to another redirect url. so with redirect = "follow", http automatically sends to new url, this compromises our safety. so redirect manual enables to restrict the followup request to new redirect urls.
        errorMessage = `HTTP ${response.status}`;
        if (!response.ok) {// status code of 2xx gives ok and rest 3xx, 4xx, 5xx are failed
            await pool.query(`UPDATE attempts SET duration_ms = $1,  response_status = $2, error = $3 WHERE id = $4`, [elapsedTime, response.status, errorMessage, attemptRecord.rows[0].id])
            // await pool.query(`UPDATE deliveries SET last_error = $1, status = $2, locked_until = $3, next_attempt_at = now() + interval '5 seconds' WHERE id = $4`, [errorMessage, 'pending', null, deliveryData.delivery_id])
            throw new Error(`Webhook request failed with status ${response.status}`);
        }
        await pool.query(`UPDATE attempts SET duration_ms = $1,  response_status = $2, error = $3 WHERE id = $4`, [elapsedTime, response.status, null, attemptRecord.rows[0].id])
        // await pool.query(`UPDATE deliveries SET last_error = $1, status = $2, locked_until = $3, next_attempt_at = $4 WHERE id = $5`, [null, 'delivered', null, null, deliveryData.delivery_id])
        await markDelivered(delivery.id)
        console.log("Webhook delivered successfully:", delivery.id);
    }
    catch(err){
        // when fetch throws (e.g. AbortSignal timeout / network error) there is no response object,
        // so fall back to the error message and store a NULL response status.
        const failureReason = errorMessage ?? (err instanceof Error ? err.message : String(err));
        if (attemptRecord) {
            await pool.query(`UPDATE attempts SET duration_ms = $1,  response_status = $2, error = $3 WHERE id = $4`, [elapsedTime? elapsedTime:0, response?.status ?? null, failureReason, attemptRecord.rows[0].id])
        }
        const delayMs = computeRetryDelayMs(
            delivery.attempt_count,
            {
                baseMs: RETRY_BASE_MS,
                capMs: RETRY_CAP_MS
            }
        );
        await markFailed(delivery.id, failureReason, delayMs)
    }
}

async function markDelivered(deliveryId : string){
    const response  = await pool.query(`
            UPDATE deliveries
            SET status = 'delivered',
                locked_until = NULL,
                last_error = NULL
            WHERE id = $1
            AND status = 'in_flight'
        `, [deliveryId]);

    if(response.rowCount == 0){
        throw new Error("Delivery is not in in_flight state.")
    }
}

async function markFailed(deliveryId : string, errorMsg : string, delayMs: number) {
    const response = await pool.query(`
        UPDATE deliveries
        SET status = 'pending',
            locked_until = NULL,
            next_attempt_at = now() + ($3 * interval '1 millisecond'),
            last_error = $2
        WHERE id = $1
        AND status = 'in_flight';
        `, [deliveryId, errorMsg, delayMs])
    
    if(response.rowCount == 0){
        throw new Error("Delivery is not in in_flight state.");
    }
}

async function sleep(ms : number) {
    return new Promise(resolve => setTimeout(resolve, ms)) //here we create a new promise which has a function setTimeout which is programmed to run a function[resolve] after certain ms. and resolve is a function which marks the promise as completed.
}
export async function startWorker(signal?: AbortSignal){ //discalimer this signal is only for one particular test. dont mind.
    while(true){
        // console.log("started..")
        if(signal?.aborted){ //this is to make sure to stop the infinitely running worker for a particualr test.
            break;
        }
        try{
            const delivery = await claimDelivery();
            if(!delivery){ //if no pending delivery
                await sleep(POLL_INTERVAL_MS); //wait for a certian time.
                continue;
            }
            console.log(`worker ${process.pid} has claimed the delivery ${delivery.id}`)
            
            await processDelivery(delivery, delivery.attempt_count);
        }
        catch(err){
            console.log("Worker iteration Failed!!")
            await sleep(POLL_INTERVAL_MS);
        }
    }
}