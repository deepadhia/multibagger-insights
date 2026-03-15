import { fetchAndStorePrice } from "../services/price.service.js";
import { getAllStocks } from "../services/stocks.service.js";

/**
 * POST /api/prices/fetch
 * Body: { ticker: string, backfill?: boolean }
 */
export async function fetchPriceHandler(req, res) {
  try {
    const { ticker, backfill } = req.body ?? {};
    const result = await fetchAndStorePrice({
      ticker: ticker ? String(ticker).trim() : "",
      backfill: Boolean(backfill),
    });
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        tried_symbols: result.tried_symbols,
      });
    }
    return res.json(result);
  } catch (err) {
    console.error("prices/fetch error:", err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * POST /api/prices/refresh-all
 * Body: { backfill?: boolean }
 * Refreshes price for all stocks (with delay between requests).
 */
export async function refreshAllPricesHandler(req, res) {
  try {
    const stocks = await getAllStocks();
    if (stocks.length === 0) {
      return res.json({ message: "No stocks found", results: [] });
    }
    const backfill = Boolean(req.body?.backfill);
    const results = [];
    for (const stock of stocks) {
      await new Promise((r) => setTimeout(r, 1500));
      const result = await fetchAndStorePrice({ ticker: stock.ticker, backfill });
      results.push({ ticker: stock.ticker, success: result.success, error: result.error });
    }
    const successCount = results.filter((r) => r.success).length;
    return res.json({
      message: `Refreshed prices for ${successCount}/${stocks.length} stocks`,
      results,
    });
  } catch (err) {
    console.error("prices/refresh-all error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
