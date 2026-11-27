
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { pool } from "../src/db/pool.js";

describe("POST /endpoints", () => {
    it("should create an endpoint and return its id and secret", async () => {
        const response = await request(app)
            .post("/endpoints")
            .send({
                url: "https://example.com/webhook",
            });

        expect(response.status).toBe(201);
        expect(response.body.message).toBe("created");
        expect(response.body.secret).toMatch(/^whsec_/);
        expect(response.body.id).toBeDefined();

        const result = await pool.query(
            "SELECT id, secret FROM endpoints WHERE url = $1",
            ["https://example.com/webhook"]
        );

        expect(result.rows).toHaveLength(1);
        expect(String(result.rows[0].id)).toBe(String(response.body.id));
        expect(result.rows[0].secret).toBe(response.body.secret);
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
