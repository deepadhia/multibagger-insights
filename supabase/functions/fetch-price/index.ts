import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AlphaGlobalQuote = Record<string, string>;

type QuoteResult = {
  symbol: string;
  quote: AlphaGlobalQuote;
} | null;

const parseNumber = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

async function fetchGlobalQuote(apiKey: string, symbol: string): Promise<QuoteResult> {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data?.["Error Message"] || data?.["Note"]) {
    console.log("GLOBAL_QUOTE error for", symbol, ":", data?.["Error Message"] || data?.["Note"]);
    return null;
  }

  const quote = data?.["Global Quote"] as AlphaGlobalQuote | undefined;
  if (!quote?.["05. price"]) return null;

  return { symbol, quote };
}

async function discoverSymbols(apiKey: string, keyword: string): Promise<string[]> {
  const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keyword)}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data?.["Error Message"] || data?.["Note"] || !Array.isArray(data?.bestMatches)) {
    return [];
  }

  return data.bestMatches
    .filter((m: Record<string, string>) => {
      const region = (m["4. region"] || "").toLowerCase();
      const currency = (m["8. currency"] || "").toLowerCase();
      return region.includes("india") || currency === "inr";
    })
    .map((m: Record<string, string>) => m["1. symbol"])
    .filter(Boolean)
    .slice(0, 8);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, api_key } = await req.json();

    if (!ticker || typeof ticker !== "string") {
      return new Response(JSON.stringify({ success: false, error: "Ticker is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedTicker = ticker.trim().toUpperCase();
    const alphaKey = api_key || Deno.env.get("ALPHA_VANTAGE_API_KEY");

    if (!alphaKey) {
      return new Response(JSON.stringify({ success: false, error: "Price API key is not configured." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    let stockId: string | null = null;
    let screenerSlug: string | null = null;

    if (supabase) {
      const { data: stock } = await supabase
        .from("stocks")
        .select("id, screener_slug")
        .eq("ticker", normalizedTicker)
        .maybeSingle();

      stockId = stock?.id ?? null;
      screenerSlug = stock?.screener_slug?.toUpperCase() ?? null;
    }

    const tickerCandidates = new Set<string>([
      normalizedTicker,
      `${normalizedTicker}.NSE`,
      `${normalizedTicker}.BSE`,
      `${normalizedTicker}.NS`,
      `${normalizedTicker}.BO`,
    ]);

    if (screenerSlug) {
      tickerCandidates.add(screenerSlug);
      tickerCandidates.add(`${screenerSlug}.NSE`);
      tickerCandidates.add(`${screenerSlug}.BSE`);
      tickerCandidates.add(`${screenerSlug}.NS`);
      tickerCandidates.add(`${screenerSlug}.BO`);
    }

    let foundQuote: QuoteResult = null;
    const triedSymbols: string[] = [];

    for (const symbol of tickerCandidates) {
      triedSymbols.push(symbol);
      console.log("Trying ticker:", symbol);
      foundQuote = await fetchGlobalQuote(alphaKey, symbol);
      if (foundQuote) {
        console.log("Found price for", symbol, ":", foundQuote.quote["05. price"]);
        break;
      }
    }

    if (!foundQuote) {
      const discoveryKeywords = [normalizedTicker, screenerSlug].filter(Boolean) as string[];
      for (const keyword of discoveryKeywords) {
        const discovered = await discoverSymbols(alphaKey, keyword);
        for (const symbol of discovered) {
          if (triedSymbols.includes(symbol)) continue;
          triedSymbols.push(symbol);
          console.log("Trying discovered symbol:", symbol);
          foundQuote = await fetchGlobalQuote(alphaKey, symbol);
          if (foundQuote) break;
        }
        if (foundQuote) break;
      }
    }

    if (!foundQuote) {
      if (supabase && stockId) {
        const { data: lastPrice } = await supabase
          .from("prices")
          .select("price, volume, change_percent, date")
          .eq("stock_id", stockId)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastPrice) {
          return new Response(JSON.stringify({
            success: true,
            stale: true,
            source: "database",
            symbol: normalizedTicker,
            ...lastPrice,
            message: "Live quote unavailable. Returned latest stored price.",
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({
        success: false,
        error: `No live data returned for ticker ${normalizedTicker}`,
        tried_symbols: triedSymbols,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { symbol, quote } = foundQuote;
    const result = {
      symbol,
      price: parseNumber(quote["05. price"]),
      volume: parseNumber(quote["06. volume"]),
      change_percent: parseNumber((quote["10. change percent"] || "").replace("%", "")),
      date: quote["07. latest trading day"] || new Date().toISOString().slice(0, 10),
    };

    if (!result.price) {
      return new Response(JSON.stringify({ success: false, error: "Invalid quote payload received" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (supabase && stockId) {
      await supabase.from("prices").insert({
        stock_id: stockId,
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
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
