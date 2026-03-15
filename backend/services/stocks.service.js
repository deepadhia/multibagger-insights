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

/** Returns all stocks for batch operations: { id, ticker, screener_slug }[]. */
export async function getAllStocks() {
  const result = await pool.query(
    "SELECT id, UPPER(TRIM(ticker)) AS ticker, screener_slug FROM stocks ORDER BY ticker",
  );
  return result.rows.map((r) => ({
    id: r.id,
    ticker: String(r.ticker || "").toUpperCase(),
    screener_slug: r.screener_slug ? String(r.screener_slug).trim() : null,
  }));
}

/** Returns { ticker, screener_slug } for pipeline to use correct Screener URL (e.g. HBL -> HBLENGINE). */
export async function getTickersWithScreenerSlug(tickers) {
  if (!Array.isArray(tickers) || tickers.length === 0) return new Map();
  const result = await pool.query(
    "SELECT UPPER(TRIM(ticker)) AS ticker, screener_slug FROM stocks WHERE UPPER(TRIM(ticker)) = ANY($1)",
    [tickers.map((t) => String(t).toUpperCase())],
  );
  const map = new Map();
  for (const row of result.rows) {
    const t = String(row.ticker || "").toUpperCase();
    const slug = row.screener_slug ? String(row.screener_slug).trim() : null;
    map.set(t, slug || t);
  }
  return map;
}

