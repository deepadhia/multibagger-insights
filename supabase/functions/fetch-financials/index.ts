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

    // Use screener_slug if provided, otherwise try ticker
    const slug = screener_slug || ticker;
    const screenerUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/consolidated/`;
    console.log("Fetching:", screenerUrl);

    const response = await fetch(screenerUrl, {
      headers: {
        "Cookie": `csrftoken=${csrfToken}; sessionid=${sessionId}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.screener.in/",
      },
      redirect: "follow",
    });

    console.log("Response status:", response.status, "URL:", response.url);

    if (!response.ok) {
      // Try standalone if consolidated fails
      const standaloneUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/`;
      console.log("Trying standalone:", standaloneUrl);
      const resp2 = await fetch(standaloneUrl, {
        headers: {
          "Cookie": `csrftoken=${csrfToken}; sessionid=${sessionId}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Referer": "https://www.screener.in/",
        },
      });
      if (!resp2.ok) {
        return new Response(JSON.stringify({ error: `Screener.in returned ${resp2.status}. Session may have expired.` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      var html = await resp2.text();
    } else {
      var html = await response.text();
    }

    console.log("HTML length:", html.length);

    // Parse key financial ratios from the page
    const metrics = parseScreenerData(html);
    console.log("Parsed metrics:", JSON.stringify(metrics));

    // Store in DB
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (metrics.yearly.length > 0) {
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
        if (error) console.error("Upsert error:", error);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      ratios: metrics.ratios,
      yearly: metrics.yearly,
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
    promoter_holding: number | null;
  } = {
    ratios: {},
    yearly: [],
    promoter_holding: null,
  };

  // Extract top ratios from the "ratios" section
  // These appear as <li class="flex flex-space-between"> with <span class="name"> and <span class="value">
  const ratioPatterns: Record<string, RegExp> = {
    "Market Cap": /Market Cap.*?<span[^>]*class="number"[^>]*>\s*([\d,]+\.?\d*)/s,
    "Current Price": /Current Price.*?<span[^>]*class="number"[^>]*>\s*([\d,]+\.?\d*)/s,
    "Stock P/E": /Stock P\/E.*?<span[^>]*class="number"[^>]*>\s*([\d,]+\.?\d*)/s,
    "ROCE": /ROCE.*?<span[^>]*class="number"[^>]*>\s*([\d,]+\.?\d*)\s*%/s,
    "ROE": /ROE.*?<span[^>]*class="number"[^>]*>\s*([\d,]+\.?\d*)\s*%/s,
    "Debt to Equity": /Debt to equity.*?<span[^>]*class="number"[^>]*>\s*([\d,]+\.?\d*)/s,
    "Promoter Holding": /Promoter holding.*?<span[^>]*class="number"[^>]*>\s*([\d,]+\.?\d*)\s*%/s,
  };

  // Try alternative patterns too
  const altPatterns: Record<string, RegExp> = {
    "ROCE": /ROCE\s*<\/span>\s*<span[^>]*>\s*([\d.]+)\s*%/s,
    "ROE": /ROE\s*<\/span>\s*<span[^>]*>\s*([\d.]+)\s*%/s,
    "Debt to Equity": /Debt to equity\s*<\/span>\s*<span[^>]*>\s*([\d.]+)/s,
    "Promoter Holding": /Promoter holding\s*<\/span>\s*<span[^>]*>\s*([\d.]+)\s*%/s,
  };

  for (const [key, pattern] of Object.entries(ratioPatterns)) {
    const match = html.match(pattern);
    if (match) {
      result.ratios[key] = match[1].replace(/,/g, "");
    }
  }

  // Try alternative patterns for missing values
  for (const [key, pattern] of Object.entries(altPatterns)) {
    if (!result.ratios[key]) {
      const match = html.match(pattern);
      if (match) {
        result.ratios[key] = match[1].replace(/,/g, "");
      }
    }
  }

  if (result.ratios["Promoter Holding"]) {
    result.promoter_holding = parseFloat(result.ratios["Promoter Holding"]);
  }

  // Extract yearly data from "Profit & Loss" section
  // Look for the revenue/sales row and years
  const yearMatch = html.match(/<thead>.*?<tr>.*?(<th[^>]*>.*?<\/th>)+.*?<\/tr>.*?<\/thead>/gs);
  
  // Try to extract years from the profit & loss table headers
  const yearPattern = /Mar (\d{4})|FY(\d{4})/g;
  const years: number[] = [];
  let yMatch;
  
  // Look in the first 30% of HTML for the P&L table
  const plSection = html.substring(0, Math.floor(html.length * 0.5));
  while ((yMatch = yearPattern.exec(plSection)) !== null) {
    const year = parseInt(yMatch[1] || yMatch[2]);
    if (year >= 2015 && year <= 2030 && !years.includes(year)) {
      years.push(year);
    }
  }

  // For each found year, create a basic entry
  // The detailed yearly data parsing from HTML tables is complex,
  // so we use the top-level ratios + any available data
  const currentYear = new Date().getFullYear();
  const roce = result.ratios["ROCE"] ? parseFloat(result.ratios["ROCE"]) : null;
  const roe = result.ratios["ROE"] ? parseFloat(result.ratios["ROE"]) : null;
  const debtEquity = result.ratios["Debt to Equity"] ? parseFloat(result.ratios["Debt to Equity"]) : null;

  // Create entry for latest year with available ratios
  if (roce || roe || debtEquity) {
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

  return result;
}
