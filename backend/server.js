import express from "express";
import dotenv from "dotenv";
import pkg from "pg";

const { Pool } = pkg;

// Load env from .env.local first, then fallback to .env
dotenv.config({ path: ".env.local" });
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local or your environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/stocks/:id/reset-insights", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing stock id" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE stocks
       SET tracking_directives = NULL,
           metric_keys = NULL
       WHERE id = $1`,
      [id],
    );

    await client.query(
      `DELETE FROM management_promises
       WHERE stock_id = $1`,
      [id],
    );

    await client.query(
      `DELETE FROM quarterly_snapshots
       WHERE stock_id = $1`,
      [id],
    );

    await client.query("COMMIT");

    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("reset-insights error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Express backend listening on http://localhost:${PORT}`);
});

