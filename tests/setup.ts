import dotenv from "dotenv";
import { beforeEach, afterAll } from "vitest";

dotenv.config({ path: ".env.test", override: true }); //this is a key line for tests. becuase this sets the environment of .env.test for the operating system. then later during config it will import the values present in it. 

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