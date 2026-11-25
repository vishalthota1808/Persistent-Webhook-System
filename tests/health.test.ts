import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /health", () => { // describe helps us to group tests.
    it("should return 200 when the database is up", async () => { //it represents one test
        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: "ok",
            db: "up",
        });
    });
});