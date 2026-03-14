import dotenv from "dotenv";

// Load env from .env.local first, then fallback to .env
dotenv.config({ path: ".env.local" });
dotenv.config();

export const DATABASE_URL = process.env.DATABASE_URL || "";
export const PORT = Number(process.env.PORT || 4000);

if (!DATABASE_URL) {
  // Backend cannot function without a DB; fail fast
  console.error("DATABASE_URL is not set. Add it to .env.local or your environment.");
  process.exit(1);
}

