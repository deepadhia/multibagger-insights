import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Backend env is separate from frontend (VITE_*). For local dev use .env.local at repo root;
// for deployment set DATABASE_URL, PORT, GOOGLE_* etc. in your host (e.g. Railway, Render).
const repoRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

export const DATABASE_URL = process.env.DATABASE_URL || "";
export const PORT = Number(process.env.PORT || 4000);

/** Supabase project URL and anon key for proxying Edge Functions (fetch-price, fetch-financials). */
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

if (!DATABASE_URL) {
  // Backend cannot function without a DB; fail fast
  console.error("DATABASE_URL is not set. Add it to .env.local or your environment.");
  process.exit(1);
}

