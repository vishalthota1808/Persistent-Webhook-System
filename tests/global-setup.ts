import dotenv from "dotenv";

export async function setup() {
    console.log("GLOBAL SETUP STARTED");
    dotenv.config({ path: ".env.test", override: true }); // tell to use ".env.test" as default ".env config" from now. instead of default .env. so whenever we use pool in tests, we route them to a our test db .

    const { runMigrations } = await import("../src/db/migrate.js");
    const { pool } = await import("../src/db/pool.js");

    try {
        await runMigrations();
        console.log("TEST DB:", process.env.DB_NAME);
    } finally {
        await pool.end();
    }
}
