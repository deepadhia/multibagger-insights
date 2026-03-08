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
      return new Response(JSON.stringify({ error: "Failed to fetch Screener.in page" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("HTML length:", html.length);

    const metrics = parseScreenerData(html);
    console.log("Parsed ratios:", JSON.stringify(metrics.ratios));
    console.log("Parsed yearly count:", metrics.yearly.length);
    console.log("Parsed quarterly count:", metrics.quarterly.length);

    // Store in DB
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Upsert yearly metrics
    for (const m of metrics.yearly) {
      const { error } = await supabase.from("financial_metrics").upsert(
        {
          stock_id,
          year: m.year,
          revenue_growth: m.revenue_growth,
          profit_growth: m.profit_growth,
          roce: m.roce,
          roe: m.roe,
          debt_equity: m.debt_equity,
          promoter_holding: metrics.promoter_holding,
          free_cash_flow: m.free_cash_flow,
        },
        { onConflict: "stock_id,year", ignoreDuplicates: false }
      );
      if (error) console.error("Upsert yearly error:", error);
    }

    // Upsert quarterly financial results
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

    return new Response(JSON.stringify({
      success: true,
      ratios: metrics.ratios,
      yearly: metrics.yearly,
      quarterly: metrics.quarterly,
      promoter_holding: metrics.promoter_holding,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-financials error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchScreenerPage(slug: string, sessionId: string, csrfToken: string): Promise<string | null> {
  const headers = {
    "Cookie": `csrftoken=${csrfToken}; sessionid=${sessionId}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.screener.in/",
  };

  // Try consolidated first
  const consolidatedUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/consolidated/`;
  console.log("Fetching:", consolidatedUrl);
  const resp1 = await fetch(consolidatedUrl, { headers, redirect: "follow" });
  console.log("Consolidated status:", resp1.status);

  if (resp1.ok) return await resp1.text();

  // Fallback to standalone
  const standaloneUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/`;
  console.log("Trying standalone:", standaloneUrl);
  const resp2 = await fetch(standaloneUrl, { headers, redirect: "follow" });
  console.log("Standalone status:", resp2.status);

  if (resp2.ok) return await resp2.text();

  return null;
}

function parseScreenerData(html: string) {
  const result: {
    ratios: Record<string, string>;
    yearly: Array<{
      year: number;
      revenue_growth: number | null;
      profit_growth: number | null;
      roce: number | null;
      roe: number | null;
      debt_equity: number | null;
      free_cash_flow: number | null;
    }>;
    quarterly: Array<{
      quarter: string;
      revenue: number | null;
      ebitda_margin: number | null;
      debt: number | null;
      capex: number | null;
    }>;
    promoter_holding: number | null;
  } = {
    ratios: {},
    yearly: [],
    quarterly: [],
    promoter_holding: null,
  };

  // ── 1. Extract top-ratios ──
  const ratioSection = html.match(/<ul id="top-ratios">([\s\S]*?)<\/ul>/);
  if (ratioSection) {
    const liItems = ratioSection[1].match(/<li[\s\S]*?<\/li>/g) || [];
    for (const li of liItems) {
      const nameMatch = li.match(/<span class="name">\s*([\s\S]*?)\s*<\/span>/);
      const numberMatch = li.match(/<span class="number">([\d,\.\-]+)<\/span>/);
      if (nameMatch && numberMatch) {
        const name = nameMatch[1].replace(/<[^>]+>/g, "").trim();
        const value = numberMatch[1].replace(/,/g, "");
        result.ratios[name] = value;
      }
    }
  }

  // Promoter holding
  if (result.ratios["Promoter Holding"]) {
    result.promoter_holding = parseFloat(result.ratios["Promoter Holding"]);
  }

  // ── 2. Parse Profit & Loss table for yearly revenue/profit ──
  const plSection = html.match(/<section id="profit-loss"[\s\S]*?<\/section>/);
  if (plSection) {
    const table = plSection[0].match(/<table[\s\S]*?<\/table>/);
    if (table) {
      const headerRow = table[0].match(/<thead[\s\S]*?<\/thead>/);
      const years: string[] = [];
      if (headerRow) {
        const thMatches = headerRow[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
        for (const th of thMatches) {
          const text = th.replace(/<[^>]+>/g, "").trim();
          if (text.match(/Mar \d{4}|FY\d{2}|\d{4}/)) {
            years.push(text);
          }
        }
      }

      const bodyRows = table[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
      let revenueRow: number[] = [];
      let profitRow: number[] = [];

      for (const row of bodyRows) {
        const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
        const label = cells[0]?.replace(/<[^>]+>/g, "").trim().toLowerCase() || "";

        if (label.includes("sales") || label.includes("revenue")) {
          revenueRow = cells.slice(1).map(c => parseFloat(c.replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0);
        }
        if (label.includes("net profit") && !label.includes("margin")) {
          profitRow = cells.slice(1).map(c => parseFloat(c.replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0);
        }
      }

      // Build yearly entries with growth rates
      for (let i = 0; i < years.length; i++) {
        const yearMatch = years[i].match(/(\d{4})/);
        if (!yearMatch) continue;
        const year = parseInt(yearMatch[1]);

        const revGrowth = i > 0 && revenueRow[i - 1] > 0
          ? Math.round(((revenueRow[i] - revenueRow[i - 1]) / revenueRow[i - 1]) * 100 * 10) / 10
          : null;
        const profGrowth = i > 0 && profitRow[i - 1] > 0
          ? Math.round(((profitRow[i] - profitRow[i - 1]) / profitRow[i - 1]) * 100 * 10) / 10
          : null;

        result.yearly.push({
          year,
          revenue_growth: revGrowth,
          profit_growth: profGrowth,
          roce: null,
          roe: null,
          debt_equity: null,
          free_cash_flow: null,
        });
      }
    }
  }

  // ── 3. Parse Quarterly Results table ──
  const qrSection = html.match(/<section id="quarters"[\s\S]*?<\/section>/);
  if (qrSection) {
    const table = qrSection[0].match(/<table[\s\S]*?<\/table>/);
    if (table) {
      const headerRow = table[0].match(/<thead[\s\S]*?<\/thead>/);
      const quarters: string[] = [];
      if (headerRow) {
        const thMatches = headerRow[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
        for (const th of thMatches) {
          const text = th.replace(/<[^>]+>/g, "").trim();
          if (text.match(/(Mar|Jun|Sep|Dec)\s+\d{4}/)) {
            quarters.push(text);
          }
        }
      }

      const bodyRows = table[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
      let salesRow: number[] = [];
      let opmRow: number[] = [];

      for (const row of bodyRows) {
        const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
        const label = cells[0]?.replace(/<[^>]+>/g, "").trim().toLowerCase() || "";

        if (label.includes("sales") || label.includes("revenue")) {
          salesRow = cells.slice(1).map(c => parseFloat(c.replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0);
        }
        if (label.includes("opm") || label.includes("operating profit margin")) {
          opmRow = cells.slice(1).map(c => parseFloat(c.replace(/<[^>]+>/g, "").replace(/,/g, "").replace(/%/g, "").trim()) || 0);
        }
      }

      for (let i = 0; i < quarters.length; i++) {
        result.quarterly.push({
          quarter: quarters[i],
          revenue: salesRow[i] ?? null,
          ebitda_margin: opmRow[i] ?? null,
          debt: null,
          capex: null,
        });
      }
    }
  }

  // ── 4. Parse Balance Sheet for debt ──
  const bsSection = html.match(/<section id="balance-sheet"[\s\S]*?<\/section>/);
  if (bsSection) {
    const table = bsSection[0].match(/<table[\s\S]*?<\/table>/);
    if (table) {
      const bodyRows = table[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
      for (const row of bodyRows) {
        const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
        const label = cells[0]?.replace(/<[^>]+>/g, "").trim().toLowerCase() || "";

        if (label.includes("borrowings") || label === "debt") {
          const vals = cells.slice(1).map(c => parseFloat(c.replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0);
          // Apply last debt value to latest yearly entry
          if (vals.length > 0 && result.yearly.length > 0) {
            const lastDebt = vals[vals.length - 1];
            // We can derive D/E if we have equity info, for now just store
          }
        }
      }
    }
  }

  // ── 5. Apply top-ratios to latest year ──
  const roce = result.ratios["ROCE"] ? parseFloat(result.ratios["ROCE"]) : null;
  const roe = result.ratios["ROE"] ? parseFloat(result.ratios["ROE"]) : null;
  const debtEquity = result.ratios["Debt to equity"] ? parseFloat(result.ratios["Debt to equity"]) : null;

  if (result.yearly.length > 0) {
    const latest = result.yearly[result.yearly.length - 1];
    latest.roce = roce;
    latest.roe = roe;
    latest.debt_equity = debtEquity;
  } else if (roce !== null || roe !== null) {
    // No P&L parsed, create a standalone entry
    const currentYear = new Date().getFullYear();
    result.yearly.push({
      year: currentYear,
      revenue_growth: null,
      profit_growth: null,
      roce,
      roe,
      debt_equity: debtEquity,
      free_cash_flow: null,
    });
  }

  // ── 6. Parse Cash Flow for FCF ──
  const cfSection = html.match(/<section id="cash-flow"[\s\S]*?<\/section>/);
  if (cfSection) {
    const table = cfSection[0].match(/<table[\s\S]*?<\/table>/);
    if (table) {
      const headerRow = table[0].match(/<thead[\s\S]*?<\/thead>/);
      const cfYears: string[] = [];
      if (headerRow) {
        const thMatches = headerRow[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
        for (const th of thMatches) {
          const text = th.replace(/<[^>]+>/g, "").trim();
          if (text.match(/Mar \d{4}|FY\d{2}|\d{4}/)) {
            cfYears.push(text);
          }
        }
      }

      const bodyRows = table[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
      let cfoRow: number[] = [];
      let capexRow: number[] = [];

      for (const row of bodyRows) {
        const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
        const label = cells[0]?.replace(/<[^>]+>/g, "").trim().toLowerCase() || "";

        if (label.includes("cash from operating")) {
          cfoRow = cells.slice(1).map(c => parseFloat(c.replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0);
        }
        if (label.includes("fixed assets purchased") || label.includes("capex")) {
          capexRow = cells.slice(1).map(c => parseFloat(c.replace(/<[^>]+>/g, "").replace(/,/g, "").trim()) || 0);
        }
      }

      // Map FCF to yearly entries
      for (let i = 0; i < cfYears.length; i++) {
        const yearMatch = cfYears[i].match(/(\d{4})/);
        if (!yearMatch) continue;
        const year = parseInt(yearMatch[1]);
        const fcf = (cfoRow[i] || 0) - Math.abs(capexRow[i] || 0);

        const existing = result.yearly.find(y => y.year === year);
        if (existing) {
          existing.free_cash_flow = Math.round(fcf * 10) / 10;
        }
      }

      // Also set capex on quarterly results if available
      for (let i = 0; i < cfYears.length && i < capexRow.length; i++) {
        // quarterly capex is harder to map, skip for now
      }
    }
  }

  return result;
}
