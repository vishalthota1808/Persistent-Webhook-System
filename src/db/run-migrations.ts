import { runMigrations } from "./migrate.js";
import { pool } from "./pool.js";

try {
    await runMigrations();
} catch (error) {
    console.error("Error running migrations:", error);
    process.exitCode = 1;
} finally {
    await pool.end();
}

// this particular code is to separate the responsibilities from a single function migrate and make it use this file to manually migrate.