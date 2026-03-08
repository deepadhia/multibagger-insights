import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: stocks, error } = await supabase
      .from("stocks")
      .select("id, ticker, screener_slug");

    if (error) throw error;
    if (!stocks || stocks.length === 0) {
      return new Response(JSON.stringify({ message: "No stocks found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if backfill is needed (first run or explicit request)
    const body = await req.json().catch(() => ({}));
    const backfill = body?.backfill === true;

    console.log(`Refreshing prices for ${stocks.length} stocks${backfill ? " (with 1Y backfill)" : ""}`);

    const results: Array<{ ticker: string; success: boolean; error?: string }> = [];

    for (const stock of stocks) {
      try {
        // Add delay to avoid Yahoo rate limits
        await new Promise(r => setTimeout(r, 1500));

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/fetch-price`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            ticker: stock.ticker,
            backfill,
          }),
        });

        const data = await resp.json();
        if (data.success) {
          console.log(`✓ ${stock.ticker} price updated`);
          results.push({ ticker: stock.ticker, success: true });
        } else {
          console.error(`✗ ${stock.ticker}:`, data.error);
          results.push({ ticker: stock.ticker, success: false, error: data.error });
        }
      } catch (e) {
        console.error(`Error for ${stock.ticker}:`, e);
        results.push({ ticker: stock.ticker, success: false, error: e instanceof Error ? e.message : "Unknown" });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return new Response(JSON.stringify({
      message: `Refreshed prices for ${successCount}/${stocks.length} stocks`,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refresh-all-prices error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
