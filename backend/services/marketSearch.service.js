/**
 * Indian equity search for "Add stock" — uses Screener.in public search API + optional HTML enrich.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * @param {string} query
 * @returns {Promise<Array<{ id: number; company_name: string; screener_slug: string; ticker_hint: string }>>}
 */
export async function searchScreenerCompanies(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const url = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(q)}&limit=25`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: "https://www.screener.in/",
    },
  });
  if (!r.ok) {
    console.warn("screener search failed:", r.status);
    return [];
  }

  /** @type {Array<{ id: number; name: string; url: string }>} */
  const raw = await r.json();
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const m = item.url?.match(/\/company\/([^/]+)\//);
      const slug = m ? String(m[1]).trim().toUpperCase() : null;
      if (!slug) return null;
      return {
        id: item.id,
        company_name: String(item.name || "").trim(),
        screener_slug: slug,
        ticker_hint: slug,
      };
    })
    .filter(Boolean);
}

/**
 * Fetch Screener company page once; parse NSE ticker, company name, sector when possible.
 * @param {string} slug - Screener URL slug (e.g. HBLENGINE)
 */
export async function enrichFromScreenerSlug(slug) {
  const s = String(slug || "").trim().toUpperCase();
  if (!s) {
    return { ok: false, error: "slug required" };
  }

  const url = `https://www.screener.in/company/${encodeURIComponent(s)}/`;
  let html;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) {
      return {
        ok: true,
        screener_slug: s,
        ticker: s,
        company_name: null,
        sector: null,
        note: "Company page not found; using slug as ticker.",
      };
    }
    html = await r.text();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }

  const nseMatch = html.match(/NSE\s*:\s*(?:<[^>]*>)?\s*([A-Z0-9-]+)/i);
  const ticker = nseMatch?.[1]?.trim().toUpperCase() || s;

  let company_name = null;
  const titleMatch = html.match(/<title>\s*([^<|]+?)\s*(?:\||<\/title>)/i);
  if (titleMatch) {
    company_name = titleMatch[1].replace(/\s+/g, " ").trim();
    company_name = company_name.replace(/\s*-\s*Screener\.in.*$/i, "").trim();
  }

  let sector = null;
  const sectorMatch = html.match(/Sector[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)</i) || html.match(/"sector_name"\s*:\s*"([^"]+)"/i);
  if (sectorMatch) sector = sectorMatch[1].trim();

  return {
    ok: true,
    screener_slug: s,
    ticker,
    company_name: company_name || null,
    sector: sector || null,
  };
}
