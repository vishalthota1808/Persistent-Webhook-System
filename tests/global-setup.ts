import dotenv from "dotenv";

export async function setup() {
    dotenv.config({ path: ".env.test", override: true });

    const { runMigrations } = await import("../src/db/migrate.js");
    const { pool } = await import("../src/db/pool.js");

    console.log("TEST DB:", process.env.DB_NAME);

    try {
        await runMigrations();
    } finally {
        await pool.end();
    }
}
