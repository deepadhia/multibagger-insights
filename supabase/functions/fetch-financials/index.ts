import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { stock_id, ticker, screener_slug } = await req.json();

    if (!stock_id || !ticker) {
      return new Response(JSON.stringify({ error: "stock_id and ticker are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionId = Deno.env.get("SCREENER_SESSION_ID");
    const csrfToken = Deno.env.get("SCREENER_CSRF_TOKEN");

    if (!sessionId || !csrfToken) {
      return new Response(JSON.stringify({ error: "Screener.in credentials not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slug = screener_slug || ticker;
    const html = await fetchScreenerPage(slug, sessionId, csrfToken);

    if (!html) {
      // Try ticker as fallback if slug failed
      let fallbackHtml: string | null = null;
      if (screener_slug && screener_slug !== ticker) {
        fallbackHtml = await fetchScreenerPage(ticker, sessionId, csrfToken);
      }
      if (!fallbackHtml) {
        return new Response(JSON.stringify({
          success: false,
          error: `Could not find company "${slug}" on Screener.in. Please check the screener_slug in your stock settings.`,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Use fallback
      return processAndStore(fallbackHtml, stock_id, corsHeaders);
    }

    return processAndStore(html, stock_id, corsHeaders);
  } catch (e) {
    console.error("fetch-financials error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processAndStore(html: string, stock_id: string, corsHeaders: Record<string, string>) {
  console.log("HTML length:", html.length);

  const metrics = parseScreenerData(html);
  console.log("Parsed ratios:", JSON.stringify(metrics.ratios));
  console.log("Parsed yearly count:", metrics.yearly.length);
  console.log("Parsed quarterly count:", metrics.quarterly.length);
  console.log("Parsed shareholding count:", metrics.shareholding.length);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  for (const m of metrics.yearly) {
    const { error } = await supabase.from("financial_metrics").upsert(
      {
        stock_id,
        year: m.year,
        revenue: m.revenue,
        net_profit: m.net_profit,
        opm: m.opm,
        eps: m.eps,
        revenue_growth: m.revenue_growth,
        profit_growth: m.profit_growth,
        roce: m.roce,
        roe: m.roe,
        debt_equity: m.debt_equity,
        promoter_holding: m.promoter_holding,
        free_cash_flow: m.free_cash_flow,
      },
      { onConflict: "stock_id,year", ignoreDuplicates: false }
    );
    if (error) console.error("Upsert yearly error:", error);
  }

  for (const q of metrics.quarterly) {
    const { error } = await supabase.from("financial_results").upsert(
      {
        stock_id,
        quarter: q.quarter,
        revenue: q.revenue,
        ebitda_margin: q.ebitda_margin,
        debt: q.debt,
        capex: q.capex,
      },
      { onConflict: "stock_id,quarter", ignoreDuplicates: false }
    );
    if (error) console.error("Upsert quarterly error:", error);
  }

  // Upsert shareholding quarterly data
  for (const sh of metrics.shareholding) {
    const { error } = await supabase.from("shareholding").upsert(
      {
        stock_id,
        quarter: sh.quarter,
        promoters: sh.promoters,
        fiis: sh.fiis,
        diis: sh.diis,
        public_holding: sh.public_holding,
        others: sh.others,
      },
      { onConflict: "stock_id,quarter", ignoreDuplicates: false }
    );
    if (error) console.error("Upsert shareholding error:", error);
  }

  return new Response(JSON.stringify({
    success: true,
    ratios: metrics.ratios,
    yearly: metrics.yearly,
    quarterly: metrics.quarterly,
    shareholding: metrics.shareholding,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchScreenerPage(slug: string, sessionId: string, csrfToken: string): Promise<string | null> {
  const headers = {
    "Cookie": `csrftoken=${csrfToken}; sessionid=${sessionId}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.screener.in/",
  };

  const consolidatedUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/consolidated/`;
  console.log("Fetching:", consolidatedUrl);
  const resp1 = await fetch(consolidatedUrl, { headers, redirect: "follow" });
  console.log("Consolidated status:", resp1.status);
  if (resp1.ok) return await resp1.text();

  const standaloneUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/`;
  console.log("Trying standalone:", standaloneUrl);
  const resp2 = await fetch(standaloneUrl, { headers, redirect: "follow" });
  console.log("Standalone status:", resp2.status);
  if (resp2.ok) return await resp2.text();

  return null;
}

// ── Helper: extract a table section by ID ──
function extractTableData(html: string, sectionId: string): { headers: string[]; rows: Record<string, number[]> } {
  const sectionRegex = new RegExp(`<section id="${sectionId}"[\\s\\S]*?<\\/section>`);
  const section = html.match(sectionRegex);
  if (!section) return { headers: [], rows: {} };

  const table = section[0].match(/<table[\s\S]*?<\/table>/);
  if (!table) return { headers: [], rows: {} };

  // Extract headers (year/quarter columns)
  const headers: string[] = [];
  const thead = table[0].match(/<thead[\s\S]*?<\/thead>/);
  if (thead) {
    const ths = thead[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
    for (const th of ths) {
      const text = th.replace(/<[^>]+>/g, "").trim();
      if (text.match(/Mar \d{4}|Jun \d{4}|Sep \d{4}|Dec \d{4}|FY\d{2}|\d{4}|TTM/)) {
        headers.push(text);
      }
    }
  }

  // Extract row data — normalize labels by stripping HTML entities and special chars
  const rows: Record<string, number[]> = {};
  const trs = table[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
  for (const tr of trs) {
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    if (tds.length === 0) continue;
    let label = tds[0].replace(/<[^>]+>/g, "").trim();
    // Normalize HTML entities and special chars
    label = label.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s*\+\s*$/, "").trim();
    if (!label) continue;
    const values = tds.slice(1).map(c => {
      const raw = c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").replace(/,/g, "").replace(/%/g, "").trim();
      const num = parseFloat(raw);
      return isNaN(num) ? 0 : num;
    });
    rows[label] = values;
  }

  return { headers, rows };
}

function findRow(rows: Record<string, number[]>, ...keywords: string[]): number[] {
  for (const key of Object.keys(rows)) {
    const lower = key.toLowerCase();
    if (keywords.some(kw => lower.includes(kw))) {
      return rows[key];
    }
  }
  return [];
}

function parseScreenerData(html: string) {
  // ── 1. Top ratios (current snapshot) ──
  const ratios: Record<string, string> = {};
  const ratioSection = html.match(/<ul id="top-ratios">([\s\S]*?)<\/ul>/);
  if (ratioSection) {
    const liItems = ratioSection[1].match(/<li[\s\S]*?<\/li>/g) || [];
    for (const li of liItems) {
      const nameMatch = li.match(/<span class="name">\s*([\s\S]*?)\s*<\/span>/);
      const numberMatch = li.match(/<span class="number">([\d,\.\-]+)<\/span>/);
      if (nameMatch && numberMatch) {
        const name = nameMatch[1].replace(/<[^>]+>/g, "").trim();
        const value = numberMatch[1].replace(/,/g, "");
        ratios[name] = value;
      }
    }
  }

  const currentRoce = ratios["ROCE"] ? parseFloat(ratios["ROCE"]) : null;
  const currentRoe = ratios["ROE"] ? parseFloat(ratios["ROE"]) : null;
  const currentDE = ratios["Debt to equity"] ? parseFloat(ratios["Debt to equity"]) : null;
  const promoterHolding = ratios["Promoter Holding"] ? parseFloat(ratios["Promoter Holding"]) : null;

  // ── 2. P&L data (absolute values + growth) ──
  const pl = extractTableData(html, "profit-loss");
  const plYears = pl.headers.filter(h => !h.includes("TTM"));
  const revenueRow = findRow(pl.rows, "sales", "revenue");
  const netProfitRow = findRow(pl.rows, "net profit");
  const opmRow = findRow(pl.rows, "opm");
  const epsRow = findRow(pl.rows, "eps");

  // Filter TTM index if present
  const ttmIdx = pl.headers.indexOf("TTM");
  const filterTTM = (arr: number[]) => ttmIdx >= 0 ? arr.filter((_, i) => i !== ttmIdx) : arr;
  const revenue = filterTTM(revenueRow);
  const netProfit = filterTTM(netProfitRow);
  const opm = filterTTM(opmRow);
  const eps = filterTTM(epsRow);

  // ── 3. Ratios section (yearly ROCE) ──
  let ratiosTable = extractTableData(html, "ratios");
  if (ratiosTable.headers.length === 0) {
    ratiosTable = extractTableData(html, "ratio");
  }
  console.log("Ratios row labels:", JSON.stringify(Object.keys(ratiosTable.rows)));

  const ratioYears = ratiosTable.headers.filter(h => !h.includes("TTM"));
  const roceRow = findRow(ratiosTable.rows, "roce");
  const ratioTTMIdx = ratiosTable.headers.indexOf("TTM");
  const roceYearly = ratioTTMIdx >= 0 ? roceRow.filter((_, i) => i !== ratioTTMIdx) : roceRow;

  // ── 3b. Balance Sheet section (ROE via Net Profit/Equity, D/E) ──
  const bs = extractTableData(html, "balance-sheet");
  console.log("Balance Sheet row labels:", JSON.stringify(Object.keys(bs.rows)));
  const bsYears = bs.headers.filter(h => !h.includes("TTM"));
  const borrowingsRow = findRow(bs.rows, "borrowings", "total debt", "long term borrowings");
  const equityRow = findRow(bs.rows, "equity capital", "share capital");
  const reservesRow = findRow(bs.rows, "reserves");
  const bsTTMIdx = bs.headers.indexOf("TTM");
  const borrowings = bsTTMIdx >= 0 ? borrowingsRow.filter((_, i) => i !== bsTTMIdx) : borrowingsRow;
  const equityCap = bsTTMIdx >= 0 ? equityRow.filter((_, i) => i !== bsTTMIdx) : equityRow;
  const reserves = bsTTMIdx >= 0 ? reservesRow.filter((_, i) => i !== bsTTMIdx) : reservesRow;

  // Compute ROE and D/E from balance sheet
  const computedRoe: (number | null)[] = [];
  const computedDE: (number | null)[] = [];
  for (let i = 0; i < bsYears.length; i++) {
    const totalEquity = (equityCap[i] || 0) + (reserves[i] || 0);
    const debt = borrowings[i] || 0;
    // Match net profit by year
    const yearMatch = bsYears[i]?.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1]) : 0;
    const plIdx = plYears.findIndex(h => h.includes(String(year)));
    const np = plIdx >= 0 ? netProfit[plIdx] : 0;
    
    computedRoe.push(totalEquity > 0 && np ? Math.round((np / totalEquity) * 100 * 10) / 10 : null);
    computedDE.push(totalEquity > 0 ? Math.round((debt / totalEquity) * 100) / 100 : null);
  }

  // ── 4. Cash flow (CFO, Capex → FCF) ──
  const cf = extractTableData(html, "cash-flow");
  console.log("Cash flow row labels:", JSON.stringify(Object.keys(cf.rows)));

  const cfYears = cf.headers.filter(h => !h.includes("TTM"));
  const cfoRow = findRow(cf.rows, "cash from operating", "operating activity");
  const capexRow = findRow(cf.rows, "fixed assets purchased", "capex", "fixed assets");
  const cfTTMIdx = cf.headers.indexOf("TTM");
  const cfo = cfTTMIdx >= 0 ? cfoRow.filter((_, i) => i !== cfTTMIdx) : cfoRow;
  const capex = cfTTMIdx >= 0 ? capexRow.filter((_, i) => i !== cfTTMIdx) : capexRow;

  // ── 5. Shareholding — quarterly data for Promoter, FII, DII, Public, Others ──
  const sh = extractTableData(html, "shareholding");
  console.log("Shareholding row labels:", JSON.stringify(Object.keys(sh.rows)));
  const shQuarters = sh.headers;
  const promoterRow = findRow(sh.rows, "promoter");
  const fiiRow = findRow(sh.rows, "fii", "foreign");
  const diiRow = findRow(sh.rows, "dii", "domestic");
  const publicRow = findRow(sh.rows, "public");
  const othersRow = findRow(sh.rows, "other", "government");
  console.log("Promoter row found:", promoterRow.length, "values");

  // Build quarterly shareholding entries
  const shareholding = shQuarters.map((q, i) => ({
    quarter: q,
    promoters: promoterRow[i] ?? null,
    fiis: fiiRow[i] ?? null,
    diis: diiRow[i] ?? null,
    public_holding: publicRow[i] ?? null,
    others: othersRow[i] ?? null,
  }));

  // Build a map: year → promoter% (use March quarter for FY, or latest available)
  const promoterByYear: Map<number, number> = new Map();
  for (let i = 0; i < shQuarters.length; i++) {
    const qLabel = shQuarters[i];
    const yearMatch = qLabel.match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1]);
    const val = promoterRow[i];
    if (!val || val === 0) continue;
    if (qLabel.includes("Mar")) {
      promoterByYear.set(year, val);
    } else if (!promoterByYear.has(year)) {
      promoterByYear.set(year, val);
    }
  }

  // ── 6. Build yearly entries ──
  const yearlyMap: Map<number, any> = new Map();

  for (let i = 0; i < plYears.length; i++) {
    const yearMatch = plYears[i].match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1]);

    const revGrowth = i > 0 && revenue[i - 1] > 0
      ? Math.round(((revenue[i] - revenue[i - 1]) / revenue[i - 1]) * 100 * 10) / 10
      : null;
    const profGrowth = i > 0 && netProfit[i - 1] > 0
      ? Math.round(((netProfit[i] - netProfit[i - 1]) / netProfit[i - 1]) * 100 * 10) / 10
      : null;

    yearlyMap.set(year, {
      year,
      revenue: revenue[i] || null,
      net_profit: netProfit[i] || null,
      opm: opm[i] || null,
      eps: eps[i] || null,
      revenue_growth: revGrowth,
      profit_growth: profGrowth,
      roce: null,
      roe: null,
      debt_equity: null,
      free_cash_flow: null,
      promoter_holding: promoterByYear.get(year) || null,
    });
  }

  // Merge ROCE from ratios section
  for (let i = 0; i < ratioYears.length; i++) {
    const yearMatch = ratioYears[i].match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1]);
    const entry = yearlyMap.get(year);
    if (entry) {
      entry.roce = roceYearly[i] || null;
    }
  }

  // Merge ROE and D/E from balance sheet computations
  for (let i = 0; i < bsYears.length; i++) {
    const yearMatch = bsYears[i].match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1]);
    const entry = yearlyMap.get(year);
    if (entry) {
      if (computedRoe[i] !== null) entry.roe = computedRoe[i];
      if (computedDE[i] !== null) entry.debt_equity = computedDE[i];
    }
  }

  // Merge FCF from cash flow
  for (let i = 0; i < cfYears.length; i++) {
    const yearMatch = cfYears[i].match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1]);
    const entry = yearlyMap.get(year);
    if (entry) {
      entry.free_cash_flow = Math.round(((cfo[i] || 0) - Math.abs(capex[i] || 0)) * 10) / 10;
    }
  }

  // Apply latest promoter holding to latest year if not already set
  if (promoterRow.length > 0 && yearlyMap.size > 0) {
    const sortedYears = Array.from(yearlyMap.keys()).sort((a, b) => a - b);
    const latestYear = sortedYears[sortedYears.length - 1];
    const latestEntry = yearlyMap.get(latestYear);
    if (latestEntry && latestEntry.promoter_holding === null) {
      latestEntry.promoter_holding = promoterRow[promoterRow.length - 1] || null;
    }
  }
  // Fallback from top ratios
  if (promoterHolding !== null && yearlyMap.size > 0) {
    const sortedYears = Array.from(yearlyMap.keys()).sort((a, b) => a - b);
    const latestEntry = yearlyMap.get(sortedYears[sortedYears.length - 1]);
    if (latestEntry && latestEntry.promoter_holding === null) {
      latestEntry.promoter_holding = promoterHolding;
    }
  }

  // If no P&L data but we have ratios, create entries from ratios section
  if (yearlyMap.size === 0 && (currentRoce !== null || currentRoe !== null)) {
    const currentYear = new Date().getFullYear();
    yearlyMap.set(currentYear, {
      year: currentYear,
      revenue: null, net_profit: null, opm: null, eps: null,
      revenue_growth: null, profit_growth: null,
      roce: currentRoce, roe: currentRoe, debt_equity: currentDE,
      free_cash_flow: null, promoter_holding: promoterHolding,
    });
  }

  const yearly = Array.from(yearlyMap.values()).sort((a, b) => a.year - b.year);

  // ── 7. Quarterly results ──
  const qr = extractTableData(html, "quarters");
  const quarters = qr.headers;
  const qRevenue = findRow(qr.rows, "sales", "revenue");
  const qOpm = findRow(qr.rows, "opm", "operating profit margin");
  const qNetProfit = findRow(qr.rows, "net profit");

  const quarterly = quarters.map((q, i) => ({
    quarter: q,
    revenue: qRevenue[i] ?? null,
    ebitda_margin: qOpm[i] ?? null,
    debt: null,
    capex: null,
  }));

  return { ratios, yearly, quarterly };
}
