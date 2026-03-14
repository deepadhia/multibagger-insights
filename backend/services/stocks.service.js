import { pool } from "../db/pool.js";

export async function resetInsightsForStock(stockId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE stocks
       SET tracking_directives = NULL,
           metric_keys = NULL
       WHERE id = $1`,
      [stockId],
    );

    await client.query(
      `DELETE FROM management_promises
       WHERE stock_id = $1`,
      [stockId],
    );

    await client.query(
      `DELETE FROM quarterly_snapshots
       WHERE stock_id = $1`,
      [stockId],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getTickersByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const result = await pool.query(
    "SELECT ticker FROM stocks WHERE id = ANY($1::uuid[])",
    [ids],
  );
  return result.rows.map((r) => String(r.ticker).toUpperCase());
}

export async function getWatchlistTickers() {
  const result = await pool.query(
    "SELECT ticker FROM stocks WHERE category = 'Watchlist'",
  );
  return result.rows.map((r) => String(r.ticker).toUpperCase());
}

export async function getAllTickers() {
  const result = await pool.query("SELECT ticker FROM stocks");
  return result.rows.map((r) => String(r.ticker).toUpperCase());
}

