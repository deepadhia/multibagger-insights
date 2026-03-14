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

const seedPath = path.join(__dirname, "..", "supabase", "seed.sql");

async function runSeed() {
  const sql = fs.readFileSync(seedPath, "utf8");

  const client = new Client({ connectionString: DATABASE_URL });

  await client.connect();

  try {
    console.log("Running seed.sql...");
    await client.query(sql);
    console.log("Seed data applied successfully.");
  } catch (err) {
    console.error("Seed error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

runSeed();

