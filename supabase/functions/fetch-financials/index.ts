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

  // Extract ratios from the top-ratios list
  // Structure: <li ...><span class="name">ROCE</span> ... <span class="number">27.3</span> ... %
  const ratioSection = html.match(/<ul id="top-ratios">([\s\S]*?)<\/ul>/);
  if (ratioSection) {
    const liItems = ratioSection[1].match(/<li[\s\S]*?<\/li>/g) || [];
    for (const li of liItems) {
      const nameMatch = li.match(/<span class="name">\s*([\s\S]*?)\s*<\/span>/);
      const numberMatch = li.match(/<span class="number">([\d,\.]+)<\/span>/);
      if (nameMatch && numberMatch) {
        const name = nameMatch[1].replace(/<[^>]+>/g, "").trim();
        const value = numberMatch[1].replace(/,/g, "");
        result.ratios[name] = value;
      }
    }
  }

  // Extract promoter holding (may be in ratios or elsewhere)
  if (result.ratios["Promoter Holding"]) {
    result.promoter_holding = parseFloat(result.ratios["Promoter Holding"]);
  }

  // Get ROCE, ROE, D/E from ratios
  const roce = result.ratios["ROCE"] ? parseFloat(result.ratios["ROCE"]) : null;
  const roe = result.ratios["ROE"] ? parseFloat(result.ratios["ROE"]) : null;
  
  // Debt to equity might not be in default ratios
  const debtEquity = result.ratios["Debt to equity"] ? parseFloat(result.ratios["Debt to equity"]) : null;

  // Create entry for current year with ratios
  const currentYear = new Date().getFullYear();
  if (roce !== null || roe !== null) {
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
