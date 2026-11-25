import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";

describe("POST /events", () => {
    it("should create an event when no endpoints exist", async () => {
        const response = await request(app)
            .post("/events")
            .send({
                type: "user.created",
                data: {},
                idempotency_key: "12345",
            });

        expect(response.status).toBe(201);
        expect(response.body.event_id).toBeDefined();
        expect(response.body.deliveries_created).toBe(0);
    });

    it("should create deliveries for active endpoints", async () => {
    await request(app)
        .post("/endpoints")
        .send({ url: "https://example.com/webhook" });

    await request(app)
        .post("/endpoints")
        .send({ url: "https://test.com/webhook" });

    const response = await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: {},
            idempotency_key: "12346",
        });

    expect(response.status).toBe(201);
    expect(response.body.event_id).toBeDefined();
    expect(response.body.deliveries_created).toBe(2);
});



it("should create deliveries only for active endpoints", async () => {
    await request(app)
        .post("/endpoints")
        .send({ url: "https://active.com/webhook" });

    const inactiveEndpoint = await request(app)
        .post("/endpoints")
        .send({ url: "https://inactive.com/webhook" });

    await pool.query(
        "UPDATE endpoints SET active = false WHERE url = $1",
        ["https://inactive.com/webhook"]
    );

    const response = await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: {},
            idempotency_key: "event-12347",
        });

    expect(response.status).toBe(201);
    expect(response.body.deliveries_created).toBe(1);
});



it("should rollback the event if delivery creation fails", async () => {
    // Create an active endpoint
    await request(app)
        .post("/endpoints")
        .send({ url: "https://rollback.com/webhook" });

    // Create a PostgreSQL trigger that deliberately fails delivery insertion
    await pool.query(`
        CREATE OR REPLACE FUNCTION test_fail_delivery_insert()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Forced delivery insertion failure';
        END;
        $$ LANGUAGE plpgsql;
    `); //this is a wanted function to forcefully generate an exception in SQL

    await pool.query(`
        CREATE TRIGGER test_delivery_failure
        BEFORE INSERT ON deliveries
        FOR EACH ROW
        EXECUTE FUNCTION test_fail_delivery_insert();
    `); //assigning the above function just before the INSERT INTO deliveries to test atomicity.

    try {
        const response = await request(app)
            .post("/events")
            .send({
                type: "user.created",
                data: {},
                idempotency_key: "rollback-test-1",
            });

        expect(response.status).toBe(500);

        const result = await pool.query(
            "SELECT COUNT(*)::int AS count FROM events"
        );

        expect(result.rows[0].count).toBe(0);
    } finally {
        // Remove the test trigger and function
        await pool.query(
            "DROP TRIGGER IF EXISTS test_delivery_failure ON deliveries"
        );

        await pool.query(
            "DROP FUNCTION IF EXISTS test_fail_delivery_insert()"
        );
    }
});

    it("should reject duplicate events with the same idempotency key", async () => {
    const event = {
        type: "user.created",
        data: {},
        idempotency_key: "duplicate-test-1",
    };

    const firstResponse = await request(app)
        .post("/events")
        .send(event);

    const secondResponse = await request(app)
        .post("/events")
        .send(event);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(500);

    const result = await pool.query(
        "SELECT COUNT(*)::int AS count FROM events"
    );

    expect(result.rows[0].count).toBe(1);
});

});