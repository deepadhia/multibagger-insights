import { invokeSupabaseFunction } from "../services/supabase-proxy.service.js";

/**
 * POST /api/proxy/fetch-financials
 * Body: { stock_id, ticker, screener_slug? }
 */
export async function fetchFinancialsHandler(req, res) {
  const { stock_id, ticker, screener_slug } = req.body || {};
  if (!stock_id || !ticker) {
    return res.status(400).json({
      ok: false,
      error: "stock_id and ticker are required",
    });
  }
  const result = await invokeSupabaseFunction("fetch-financials", {
    stock_id,
    ticker: String(ticker).toUpperCase(),
    screener_slug: screener_slug || ticker,
  });
  if (!result.ok) {
    return res.status(result.status >= 400 ? result.status : 502).json({
      ok: false,
      error: result.error,
    });
  }
  return res.json(result.data);
}

/**
 * POST /api/proxy/fetch-price
 * Body: { ticker, backfill?: boolean }
 */
export async function fetchPriceHandler(req, res) {
  const { ticker, backfill } = req.body || {};
  if (!ticker) {
    return res.status(400).json({
      ok: false,
      error: "ticker is required",
    });
  }
  const result = await invokeSupabaseFunction("fetch-price", {
    ticker: String(ticker).toUpperCase(),
    backfill: Boolean(backfill),
  });
  if (!result.ok) {
    return res.status(result.status >= 400 ? result.status : 502).json({
      ok: false,
      error: result.error,
    });
  }
  return res.json(result.data);
}
