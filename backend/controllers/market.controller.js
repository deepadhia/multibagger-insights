import { searchScreenerCompanies, enrichFromScreenerSlug } from "../services/marketSearch.service.js";

/**
 * GET /api/market/stock-search?q= (min 2 chars)
 */
export async function stockSearchHandler(req, res) {
  try {
    const q = req.query?.q;
    const results = await searchScreenerCompanies(typeof q === "string" ? q : "");
    res.json({ ok: true, results });
  } catch (err) {
    console.error("stock-search error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      results: [],
    });
  }
}

/**
 * GET /api/market/stock-enrich?slug=SCREENER_SLUG
 */
export async function stockEnrichHandler(req, res) {
  try {
    const slug = typeof req.query?.slug === "string" ? req.query.slug : "";
    const data = await enrichFromScreenerSlug(slug);
    res.json(data);
  } catch (err) {
    console.error("stock-enrich error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
