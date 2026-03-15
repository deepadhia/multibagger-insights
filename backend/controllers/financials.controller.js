import { fetchAndStoreFinancials } from "../services/financials.service.js";
import { getAllStocks } from "../services/stocks.service.js";

/**
 * POST /api/financials/fetch
 * Body: { stock_id: string, ticker: string, screener_slug?: string }
 */
export async function fetchFinancialsHandler(req, res) {
  try {
    const { stock_id, ticker, screener_slug } = req.body ?? {};
    if (!stock_id || !ticker) {
      return res.status(400).json({
        success: false,
        error: "stock_id and ticker are required",
      });
    }
    const result = await fetchAndStoreFinancials({
      stock_id: String(stock_id),
      ticker: String(ticker).trim().toUpperCase(),
      screener_slug: screener_slug ? String(screener_slug).trim() : undefined,
    });
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  } catch (err) {
    console.error("financials/fetch error:", err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * POST /api/financials/refresh-all
 * Refreshes financials for all stocks (with delay between requests).
 */
export async function refreshAllFinancialsHandler(req, res) {
  try {
    const stocks = await getAllStocks();
    if (stocks.length === 0) {
      return res.json({ message: "No stocks found", results: [] });
    }
    const results = [];
    for (let i = 0; i < stocks.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2000));
      const stock = stocks[i];
      const result = await fetchAndStoreFinancials({
        stock_id: stock.id,
        ticker: stock.ticker,
        screener_slug: stock.screener_slug || stock.ticker,
      });
      results.push({ ticker: stock.ticker, success: result.success, error: result.error });
    }
    const successCount = results.filter((r) => r.success).length;
    return res.json({
      message: `Refreshed financials for ${successCount}/${stocks.length} stocks`,
      results,
    });
  } catch (err) {
    console.error("financials/refresh-all error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
