import dotenv from "dotenv";
import { beforeEach, afterAll } from "vitest";

dotenv.config({ path: ".env.test", override: true });

const { pool } = await import("../src/db/pool.js");

beforeEach(async () => {
    await pool.query(`
        TRUNCATE endpoints, events, deliveries, attempts
        RESTART IDENTITY CASCADE
    `);
});

afterAll(async () => {
    await pool.end();
});