import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pkg from "pg";

const { Client } = pkg;

// Load env from .env.local first, then fallback to .env
dotenv.config({ path: ".env.local" });
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local or your environment.");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");

async function runMigrations() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString: DATABASE_URL });

  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query("SELECT name FROM schema_migrations");
    const appliedSet = new Set((applied.rows || []).map((r) => r.name));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`Skipping (already applied): ${file}`);
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      console.log(`Running migration: ${file}`);

      try {
        await client.query(sql);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists|duplicate key/i.test(msg)) {
          console.log(`  (objects already exist, marking as applied)`);
        } else {
          throw err;
        }
      }

      await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [file]);
      appliedSet.add(file);
    }

    console.log("All migrations applied successfully.");
  } catch (err) {
    console.error("Migration error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runMigrations();

