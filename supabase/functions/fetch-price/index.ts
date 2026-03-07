import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, api_key } = await req.json();

    if (!ticker) {
      return new Response(JSON.stringify({ error: "Ticker is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alphaKey = api_key || Deno.env.get("ALPHA_VANTAGE_API_KEY");
    if (!alphaKey) {
      return new Response(JSON.stringify({ error: "Alpha Vantage API key not configured. Please provide it." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(alphaKey)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data["Error Message"] || data["Note"]) {
      return new Response(JSON.stringify({ error: data["Error Message"] || data["Note"] }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quote = data["Global Quote"];
    if (!quote || !quote["05. price"]) {
      return new Response(JSON.stringify({ error: "No data returned for ticker" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = {
      price: parseFloat(quote["05. price"]),
      volume: parseInt(quote["06. volume"]),
      change_percent: parseFloat(quote["10. change percent"]?.replace("%", "") || "0"),
      date: quote["07. latest trading day"],
    };

    // Optionally store in DB
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find stock by ticker
    const { data: stock } = await supabase.from("stocks").select("id").eq("ticker", ticker).single();
    if (stock) {
      await supabase.from("prices").insert({
        stock_id: stock.id,
        price: result.price,
        volume: result.volume,
        change_percent: result.change_percent,
        date: result.date,
      });
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-price error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
