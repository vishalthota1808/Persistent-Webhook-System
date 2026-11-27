import {receiver} from "./test_receiver.ts"
import { describe, it, expect , beforeAll, afterAll, beforeEach} from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import {claimDelivery, processDelivery} from "../src/worker.ts"
import { receiverState } from "./test_receiver.ts";
import { pool } from "../src/db/pool.ts";
// import { receiverConfig } from "./test_receiver.ts";
import { REQUEST_TIMEOUT_MS } from "../src/config/index.ts";

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
            await processDelivery(claimedDelivery);
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

    await processDelivery(claimedDelivery);

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
        .toBeGreaterThan(Date.now());
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

            await processDelivery(claimedDelivery);
            const dbRow = await pool.query(
                `SELECT status, next_attempt_at, locked_until
                FROM deliveries
                WHERE id = $1`,
                [claimedDelivery.id]
            );

            expect(dbRow.rows[0].status).toBe("pending");
            expect(dbRow.rows[0].locked_until).toBeNull();

            expect(new Date(dbRow.rows[0].next_attempt_at).getTime())
                .toBeGreaterThan(Date.now());

        }, 15000)


    afterAll(async() => {
        if(receiverServer != null){
            receiverServer.close();
        }
        console.log("AFTER ALL EXECUTED");
    })


})