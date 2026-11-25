import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /deliveries", () => {
    it("should return an empty array when no deliveries exist", async () => {
        const response = await request(app).get("/deliveries");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
                                    "data": [],
                                    "message": "success",
                                    });
    });

    it("should return deliveries when they exist", async () => {
    await request(app)
        .post("/endpoints")
        .send({ url: "https://example.com/webhook" });

    await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: {},
            idempotency_key: "delivery-test-1",
        });

    const response = await request(app).get("/deliveries");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.message).toBe("success");
});

    it("should return a delivery by its ID", async () => {
    await request(app)
        .post("/endpoints")
        .send({ url: "https://example.com/webhook" });

    await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: {},
            idempotency_key: "delivery-single-test",
        });

    const listResponse = await request(app).get("/deliveries");

    const deliveryId = listResponse.body.data[0].id;

    const response = await request(app)
        .get(`/deliveries/${deliveryId}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("success");
    expect(response.body.data.id).toBe(deliveryId);
});

    it("should return 404 when delivery does not exist", async () => {
    const response = await request(app).get("/deliveries/999999");

    expect(response.status).toBe(404);
});

    it("should filter deliveries by status", async () => {
    await request(app)
        .post("/endpoints")
        .send({ url: "https://example.com/webhook" });

    await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: {},
            idempotency_key: "status-filter-1",
        });

    await request(app)
        .post("/events")
        .send({
            type: "user.updated",
            data: {},
            idempotency_key: "status-filter-2",
        });

    const response = await request(app)
        .get("/deliveries?status=pending");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);

    for (const delivery of response.body.data) {
        expect(delivery.status).toBe("pending");
    }
});

    it("should filter deliveries by endpoint_id", async () => {
    const endpoint1 = await request(app)
        .post("/endpoints")
        .send({ url: "https://one.com/webhook" });

    const endpoint2 = await request(app)
        .post("/endpoints")
        .send({ url: "https://two.com/webhook" });

    await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: {},
            idempotency_key: "endpoint-filter-1",
        });

    const allDeliveries = await request(app).get("/deliveries");

    const endpointId = allDeliveries.body.data.find(
        (delivery: any) => delivery.endpoint_id
    ).endpoint_id;

    const response = await request(app)
        .get(`/deliveries?endpoint_id=${endpointId}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].endpoint_id).toBe(endpointId);
});

    it("should filter deliveries by event_id", async () => {
    await request(app)
        .post("/endpoints")
        .send({ url: "https://example.com/webhook" });

    await request(app)
        .post("/events")
        .send({
            type: "user.created",
            data: {},
            idempotency_key: "event-filter-1",
        });

    const secondEvent = await request(app)
        .post("/events")
        .send({
            type: "user.updated",
            data: {},
            idempotency_key: "event-filter-2",
        });

    const eventId = secondEvent.body.event_id;

    const response = await request(app)
        .get(`/deliveries?event_id=${eventId}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].event_id).toBe(eventId);
});

    it("should limit the number of deliveries returned", async () => {
    await request(app)
        .post("/endpoints")
        .send({ url: "https://example.com/webhook" });

    for (let i = 1; i <= 3; i++) {
        await request(app)
            .post("/events")
            .send({
                type: "user.created",
                data: {},
                idempotency_key: `limit-test-${i}`,
            });
    }

    const response = await request(app)
        .get("/deliveries?limit=2");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
});

    it("should reject an invalid delivery status", async () => {
    const response = await request(app)
        .get("/deliveries?status=invalid");

    expect(response.status).toBe(400);
});

it("should reject an invalid endpoint_id", async () => {
    const response = await request(app)
        .get("/deliveries?endpoint_id=abc");

    expect(response.status).toBe(400);
});

it("should reject an invalid event_id", async () => {
    const response = await request(app)
        .get("/deliveries?event_id=abc");

    expect(response.status).toBe(400);
});

it("should reject a limit greater than 100", async () => {
    const response = await request(app)
        .get("/deliveries?limit=101");

    expect(response.status).toBe(400);
});
});