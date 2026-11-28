import {receiver} from "./test_receiver.ts"
import { describe, it, expect , beforeAll, afterAll, beforeEach} from "vitest";
import request from "supertest";
import { app } from "../src/app";
import {claimDelivery, processDelivery} from "../src/worker.ts"
import { startWorker } from "../src/worker.ts";
import { pool } from "../src/db/pool.ts";
import { receiverState } from "./test_receiver.ts";

describe("testing max attempts", () => {
    let receiverServer:any = null;
    beforeAll(() => {
        receiverState.responseStatus = 200;
        receiverServer = receiver.listen(4000, () => {
        console.log("Test receiver listening on port 4000");
        });
    })
    it("max attempts test", async () => {
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
            
                const deliveryResult = await pool.query(
                    `SELECT id FROM deliveries
                    WHERE event_id = (
                        SELECT id FROM events
                        WHERE idempotency_key = $1
                    )`,
                    ["failure-test"]
                );
                
                const deliveryId = deliveryResult.rows[0].id;
                const controller = new AbortController();
        
                // Give the worker the signal
                const workerPromise = startWorker(controller.signal);
                try{
        
                    const deadline = Date.now() + 15000;
                    let result = null;
                    while (Date.now() < deadline) { //we are actually polling the db every 50ms until 4 attempts recorded.
                        result = await pool.query(
                            `SELECT status, attempt_count
                            FROM deliveries 
                            WHERE id = $1`,
                            [deliveryId]
                        );
                        if(result.rows[0].status == 'failed'){
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                   
                    expect(Number((result as any).rows[0].attempt_count)).toBe(3);
                    expect(((result as any).rows[0].status)).toBe('failed');
                }
                finally{
                    // Tell the worker to stop
                    controller.abort();
                    await workerPromise;
                }

    }, 20000)
})
