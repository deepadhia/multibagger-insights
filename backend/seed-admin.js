/**
 * Create or update the admin user (bcrypt password hash in DB).
 *
 * Usage:
 *   Set in .env.local: DATABASE_URL, ADMIN_SEED_USERNAME (default: admin), ADMIN_SEED_PASSWORD (required)
 *   npm run db:seed:admin
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pkg from "pg";

const { Client } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
const username = (process.env.ADMIN_SEED_USERNAME || "admin").trim();
const password = process.env.ADMIN_SEED_PASSWORD;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (!password || String(password).length < 8) {
  console.error("Set ADMIN_SEED_PASSWORD in .env.local (at least 8 characters) before running db:seed:admin.");
  process.exit(1);
}

async function main() {
  const hash = await bcrypt.hash(String(password), 12);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO app_admin_users (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [username, hash]
    );
    console.log(`Admin user "${username}" is ready (password updated if user already existed).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
