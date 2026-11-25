import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool.js";
const migrationsDir = path.resolve("migrations");
const files = await readdir(migrationsDir);
;
const migrationFiles = files.filter((file) => file.endsWith(".sql")).sort();
const result = await pool.query("SELECT filename FROM schema_migrations ORDER BY filename");
// console.log("result.rows", result.rows);
const appliedMigrations = result.rows.map((row) => row.filename);
const pendingMigrations = migrationFiles.filter((file) => !appliedMigrations.includes(file));
console.log("Pending migrations:", pendingMigrations);
async function runMigrations() {
    for (const file of pendingMigrations) {
        const filePath = path.join(migrationsDir, file);
        const sql = await readFile(filePath, "utf-8");
        const client = await pool.connect(); //this ensures all of them use same connection and transaction
        try {
            await client.query("BEGIN"); //start transaction
            await client.query(sql); //execute the migration SQL
            await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]); //record the applied migration in the schema_migrations table
            await client.query("COMMIT"); //commit the transaction
            console.log(`Applied migration: ${file}`);
        }
        catch (error) {
            await client.query("ROLLBACK"); //rollback the transaction
            throw error; //throws the error but it must be caught.
        }
        finally {
            client.release();
        }
        // console.log(`Applied migration: ${file}`);
    }
}
runMigrations()
    .catch((error) => {
    console.error("Error running migrations:", error);
})
    .finally(() => {
    pool.end(); //close the pool after all migrations are done
});
