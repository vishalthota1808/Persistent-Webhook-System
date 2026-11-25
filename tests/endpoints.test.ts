
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("POST /endpoints", () => {
    it("should create an endpoint and return its secret", async () => {
        const response = await request(app)
            .post("/endpoints")
            .send({
                url: "https://example.com/webhook",
            });

        expect(response.status).toBe(201);
        expect(response.body.message).toBe("created");
        expect(response.body.secret).toMatch(/^whsec_/);
    });

    it("should return 400 for an invalid URL", async () => {
    const response = await request(app)
        .post("/endpoints")
        .send({
            url: "not-a-valid-url",
        });

    expect(response.status).toBe(400);
    });
});
