import { resetInsightsForStock, resetAllJsonOutputs } from "../services/stocks.service.js";
import { fetchAndStorePrice } from "../services/price.service.js";
import { fetchAndStoreFinancials } from "../services/financials.service.js";

/**
 * POST /api/stocks/refresh-screener-data
 * Body: { stock_id: string, ticker: string, screener_slug?: string }
 * Runs live price fetch then Screener financials in one request (same work as two separate calls).
 */
export async function refreshScreenerDataHandler(req, res) {
  try {
    const { stock_id, ticker, screener_slug } = req.body ?? {};
    if (!stock_id || !ticker) {
      return res.status(400).json({
        ok: false,
        error: "stock_id and ticker are required",
      });
    }
    const t = String(ticker).trim().toUpperCase();
    const sid = String(stock_id);
    const slug = screener_slug ? String(screener_slug).trim() : t;

    const priceResult = await fetchAndStorePrice({ ticker: t, backfill: false });
    const financialsResult = await fetchAndStoreFinancials({
      stock_id: sid,
      ticker: t,
      screener_slug: slug,
    });

    const ok = Boolean(priceResult.success && financialsResult.success);
    return res.json({
      ok,
      price: priceResult,
      financials: financialsResult,
    });
  } catch (err) {
    console.error("refresh-screener-data error:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export async function resetInsightsHandler(req, res) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing stock id" });
  }

  try {
    await resetInsightsForStock(id);
    res.json({ ok: true });
  } catch (err) {
    console.error("reset-insights error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/** POST /api/stocks/reset-all-json - wipe quarterly AI outputs + promise ledger for all stocks. */
export async function resetAllJsonOutputsHandler(_req, res) {
  try {
    await resetAllJsonOutputs();
    res.json({ ok: true });
  } catch (err) {
    console.error("reset-all-json error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

