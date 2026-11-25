import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Unknown routes", () => {
    it("should return 404 for an unknown route", async () => {
        const response = await request(app).get("/not-a-real-route");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: "404 Not found",
        });
    });
});

describe("Invalid JSON", () => {
    it("should return 400 when request body contains invalid JSON", async () => {
        const response = await request(app)
            .post("/echo")
            .set("Content-Type", "application/json")
            .send('{"message":');

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: "Invalid json",
        });
    });
});