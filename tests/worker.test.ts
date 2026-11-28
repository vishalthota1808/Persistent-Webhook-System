import {receiver} from "./test_receiver.ts"
import { describe, it, expect , beforeAll, afterAll, beforeEach} from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import {claimDelivery, processDelivery} from "../src/worker.ts"
import { receiverState } from "./test_receiver.ts";
import { pool } from "../src/db/pool.ts";
// import { receiverConfig } from "./test_receiver.ts";
import { REQUEST_TIMEOUT_MS } from "../src/config/index.ts";
import { startWorker } from "../src/worker.ts";

describe("worker delivery" ,  () => {
    let receiverServer:any = null;

    beforeEach(() => {
    receiverState.responseStatus = 200;
        receiverState.payload = null;
        receiverState.delayMs = 0;
    });
    beforeAll(() => {
        receiverState.responseStatus = 200;
        receiverServer = receiver.listen(4000, () => {
        console.log("Test receiver listening on port 4000");
        });
    })

    it("testing worker iteration", async () => {
        const endpoint1 = await request(app)
        .post("/endpoints")
        .send({ url: "http://localhost:4000/webhook" });

        await request(app)
                .post("/events")
                .send({
                    type: "user.created",
                    data: {},
                    idempotency_key: "endpoint-filter-1",
                });
        const claimedDelivery: any = await claimDelivery();
        console.log("Claimed delivery:", claimedDelivery.id);
        console.log("Claimed endpoint:", claimedDelivery.endpoint_id);
        console.log("Claimed event:", claimedDelivery.event_id);
        expect(claimedDelivery).not.toBeNull()
        if(claimedDelivery){
            await processDelivery(claimedDelivery, claimedDelivery.attempt_count);
            expect(receiverState.payload).not.toBeNull();
            expect((receiverState.payload as any).type).toBe("user.created")
            expect((receiverState.payload as any).data).toEqual({})

            
                const dbRow = await pool.query(`
                    SELECT status FROM deliveries WHERE id = $1
                    `, [claimedDelivery.id]
                
                )
                expect(dbRow.rows[0].status).toBe("delivered")

        }
        else{
            console.log("NO pending deliveries..")
        }
    })


    it("should retry delivery when receiver returns 500", async () => {
    receiverState.responseStatus = 500;
    // receiverPayload = null;

    const endpoint = await request(app)
        .post("/endpoints")
        .send({
            url: "http://localhost:4000/webhook"
        });

    expect(endpoint.status).toBe(201); 

    await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: {},
            idempotency_key: "worker-failure-test-1"
        });

    const claimedDelivery = await claimDelivery();
    console.log("Claimed delivery:", claimedDelivery.id);
    console.log("Claimed endpoint:", claimedDelivery.endpoint_id);
    console.log("Claimed event:", claimedDelivery.event_id);

    expect(claimedDelivery).not.toBeNull();

    // Retry delay uses full jitter, so it can legitimately be ~0ms.
    // Capture the time before processing and assert the retry is scheduled
    // at or after it, instead of comparing against Date.now() afterwards.
    const processStartedAt = Date.now();

    await processDelivery(claimedDelivery,claimedDelivery.attempt_count);

    // Receiver actually received the webhook.
    expect(receiverState.payload).not.toBeNull();
    expect((receiverState.payload as any).type).toBe("user.created");

    // Check database state.
    const dbRow = await pool.query(
        `SELECT status, next_attempt_at, locked_until
         FROM deliveries
         WHERE id = $1`,
        [claimedDelivery.id]
    );

    expect(dbRow.rows[0].status).toBe("pending");
    expect(dbRow.rows[0].locked_until).toBeNull();

    expect(new Date(dbRow.rows[0].next_attempt_at).getTime())
        .toBeGreaterThanOrEqual(processStartedAt);
});

    it("testing receiver timeout", async() => {
        receiverState.delayMs = REQUEST_TIMEOUT_MS + 1000;

        const endpoint = await request(app)
        .post("/endpoints")
        .send({
            url: "http://localhost:4000/webhook"
        });

        expect(endpoint.status).toBe(201); 

        await request(app)
            .post("/events")
            .send({
                type: "user.created",
                data: {},
                idempotency_key: "worker-failure-test-1"
            });
        

            const claimedDelivery = await claimDelivery();
            expect(claimedDelivery).not.toBeNull();
            console.log("Claimed delivery:", claimedDelivery.id);
            console.log("Claimed endpoint:", claimedDelivery.endpoint_id);
            console.log("Claimed event:", claimedDelivery.event_id);

            await processDelivery(claimedDelivery, claimedDelivery.attempt_count);
            const dbRow = await pool.query(
                `SELECT status, next_attempt_at, locked_until
                FROM deliveries
                WHERE id = $1`,
                [claimedDelivery.id]
            );

            expect(dbRow.rows[0].status).toBe("pending");
            console.log("print")
            expect(dbRow.rows[0].locked_until).toBeNull();

            expect(new Date(dbRow.rows[0].next_attempt_at).getTime())
                .toBeGreaterThan(Date.now());

        }, 15000)// by default the vitest has a timeout of 5sec for each test, but our test primarily needs to wait for 10sec, so we can provide a thrid parameter here

    it("No pending deliveries", async() => {
        const endpoint = await request(app)
            .post("/endpoints")
            .send({
                url: "http://localhost:4000/webhook"
            });

            expect(endpoint.status).toBe(201); 
            const claimedDelivery = await claimDelivery();
            expect(claimedDelivery).toBeNull();
        })

    it("should claim multiple pending deliveries without duplicates", async () => {

    // Creating an endpoint
    const endpoint = await request(app)
        .post("/endpoints")
        .send({
            url: "http://localhost:4000/webhook"
        });

    expect(endpoint.status).toBe(201);

    // Creating three events
    for (let i = 1; i <= 3; i++) {
        await request(app)
            .post("/events")
            .send({
                type: "user.created",
                data: { number: i },
                idempotency_key: `multiple-delivery-${i}`
            });
    }

    // Claim three deliveries
    const delivery1 = await claimDelivery();
    const delivery2 = await claimDelivery();
    const delivery3 = await claimDelivery();

    // Verify all three were claimed
    expect(delivery1).not.toBeNull();
    expect(delivery2).not.toBeNull();
    expect(delivery3).not.toBeNull();

    // Verify unique IDs
    const ids = [
        delivery1.id,
        delivery2.id,
        delivery3.id
    ];

    expect(new Set(ids).size).toBe(3); //expecting that all three workers claimed a unique delivery

    // Verify all three are in_flight
    const dbRows = await pool.query(
        `SELECT id, status
         FROM deliveries
         WHERE id = ANY($1::int[])`,
        [ids]
    );

    expect(dbRows.rows).toHaveLength(3);

    for (const row of dbRows.rows) {
        expect(row.status).toBe("in_flight");
    }
});

    it("concurrent workers claiming different deliveries", async() => {
            // Creating an endpoint
            const endpoint = await request(app)
                .post("/endpoints")
                .send({
                    url: "http://localhost:4000/webhook"
                });

            expect(endpoint.status).toBe(201);

            // Creating two events
            for (let i = 1; i <= 2; i++) {
                await request(app)
                    .post("/events")
                    .send({
                        type: "user.created",
                        data: { number: i },
                        idempotency_key: `multiple-delivery-${i}`
                    });
            }
            const [delivery1, delivery2] = await Promise.all([ //ensures calling both claimDelivery calls simultaneously
                claimDelivery(),
                claimDelivery()
            ]);
            expect(delivery1).not.toBeNull();
            expect(delivery2).not.toBeNull();
               // Verify unique IDs
            const ids = [
                delivery1.id,
                delivery2.id,
            ];

            expect(new Set(ids).size).toBe(2); 
                // Verify all three are in_flight
            const dbRows = await pool.query(
                `SELECT id, status
                FROM deliveries
                WHERE id = ANY($1::int[])`,
                [ids]
            );

            expect(dbRows.rows).toHaveLength(2);

            for (const row of dbRows.rows) {
                expect(row.status).toBe("in_flight");
            }
    })


    it("should record failed delivery attempt and last error", async () => {
    receiverState.responseStatus = 500;

    const endpoint = await request(app)
        .post("/endpoints")
        .send({
            url: "http://localhost:4000/webhook"
        });

    expect(endpoint.status).toBe(201);

    const event = await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: { name: "test" },
            idempotency_key: "attempt-error-test"
        });

    expect(event.status).toBe(201);

    const claimedDelivery = await claimDelivery();

    expect(claimedDelivery).not.toBeNull();

    // Retry delay uses full jitter, so it can legitimately be ~0ms.
    // Capture the time before processing and assert the retry is scheduled
    // at or after it, instead of comparing against Date.now() afterwards.
    const processStartedAt = Date.now();

    await processDelivery(claimedDelivery, claimedDelivery.attempt_count);

    // Verify attempt history
    const attemptResult = await pool.query(
        `SELECT *
         FROM attempts
         WHERE delivery_id = $1
         ORDER BY id DESC
         LIMIT 1`,
        [claimedDelivery.id]
    );

    expect(attemptResult.rows).toHaveLength(1);

    const attempt = attemptResult.rows[0];

    expect(attempt.response_status).toBe(500);
    expect(attempt.error).toContain("500");
    expect(attempt.duration_ms).not.toBeNull();

    // Verify delivery state and last_error
    const deliveryResult = await pool.query(
        `SELECT status, last_error, locked_until, next_attempt_at
         FROM deliveries
         WHERE id = $1`,
        [claimedDelivery.id]
    );

    expect(deliveryResult.rows).toHaveLength(1);

    const delivery = deliveryResult.rows[0];

    expect(delivery.status).toBe("pending");
    expect(delivery.last_error).toContain("500");
    expect(delivery.locked_until).toBeNull();
    expect(new Date(delivery.next_attempt_at).getTime())
        .toBeGreaterThanOrEqual(processStartedAt);
});
    it("always failing server", async () => {
        const endpoint = await request(app)
        .post("/endpoints")
        .send({
            url: "http://localhost:4000/fail"
        });

        expect(endpoint.status).toBe(201);

        const event = await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: { name: "test" },
            idempotency_key: "failure-test"
        });

        expect(event.status).toBe(201);

        //fetching the delivery id
        const deliveryResult = await pool.query(
            `SELECT id FROM deliveries
            WHERE event_id = (
                SELECT id FROM events
                WHERE idempotency_key = $1
            )`,
            ["failure-test"]
        );
        
        const deliveryId = deliveryResult.rows[0].id;

//very imp point: AbortController is an inbuilt js class used to stop the asynchrnous processt has two important parts:
//1. AbortController – The controller that sends the stop signal.
//2. AbortSignal – The signal that the running operation receives and listens to.

        const controller = new AbortController();

        // Give the worker the signal
        const workerPromise = startWorker(controller.signal);
        try{
            let attemptsCount = 0;

            const deadline = Date.now() + 15000;

            while (attemptsCount < 4 && Date.now() < deadline) { //we are actually polling the db every 50ms until 4 attempts recorded.
                const result = await pool.query(
                    `SELECT COUNT(*) 
                    FROM attempts 
                    WHERE delivery_id = $1`,
                    [deliveryId]
                );

                attemptsCount = Number(result.rows[0].count);

                await new Promise(resolve => setTimeout(resolve, 50));
            }

            expect(attemptsCount).toBeGreaterThanOrEqual(4);

            //we are now verifying the actual gaps between the attemps using the started_at records..
            const result = await pool.query( 
                `SELECT started_at FROM attempts ORDER BY started_at ASC`
            );

            for (let i = 1; i < result.rows.length; i++) {
                const gap =
                    new Date(result.rows[i].started_at).getTime() -
                    new Date(result.rows[i - 1].started_at).getTime();

                console.log(`Gap ${i}: ${gap} ms`);
            }
        }
        finally{
            // Tell the worker to stop
            controller.abort();
            await workerPromise;
        }
    })
    afterAll(async() => {
        if(receiverServer != null){
            receiverServer.close();
        }
        console.log("AFTER ALL EXECUTED");
    })


})