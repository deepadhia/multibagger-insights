import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type NormalizedQuote = {
  symbol: string;
  price: number;
  volume: number | null;
  change_percent: number | null;
  date: string;
};

const formatDate = (epochSeconds?: number) => {
  if (!epochSeconds) return new Date().toISOString().slice(0, 10);
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
};

async function fetchYahooQuote(symbol: string): Promise<NormalizedQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      const body = await response.text();
      console.log(`Yahoo ${response.status} for ${symbol}:`, body.slice(0, 200));
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;

    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;

    const previousClose = Number(meta?.chartPreviousClose);
    const changePercent = Number.isFinite(previousClose) && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null;

    return {
      symbol,
      price,
      volume: Number.isFinite(meta?.regularMarketVolume) ? Number(meta.regularMarketVolume) : null,
      change_percent: changePercent ? Math.round(changePercent * 100) / 100 : null,
      date: formatDate(Number(meta?.regularMarketTime)),
    };
  } catch (e) {
    console.log(`Yahoo fetch error for ${symbol}:`, e);
    return null;
  }
}

async function discoverFromScreener(slugOrTicker: string): Promise<string | null> {
  try {
    const url = `https://www.screener.in/company/${encodeURIComponent(slugOrTicker)}/`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return null;

    const html = await response.text();
    const nseMatch = html.match(/NSE\s*:\s*(?:<[^>]*>)?\s*([A-Z0-9\-]+)/i);
    return nseMatch?.[1]?.trim().toUpperCase() ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker } = await req.json();

    if (!ticker || typeof ticker !== "string") {
      return new Response(JSON.stringify({ success: false, error: "Ticker is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedTicker = ticker.trim().toUpperCase();

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

    // Build Yahoo symbol candidates (Indian stocks use .NS for NSE, .BO for BSE)
    const candidates = new Set<string>();

    // Try NSE first (most liquid), then BSE
    const baseSymbols = new Set<string>([normalizedTicker]);
    if (screenerSlug && screenerSlug !== normalizedTicker) {
      baseSymbols.add(screenerSlug);
    }

    // Try to discover the real NSE symbol from Screener.in
    for (const slug of [screenerSlug, normalizedTicker]) {
      if (!slug) continue;
      const nseSymbol = await discoverFromScreener(slug);
      if (nseSymbol) baseSymbols.add(nseSymbol);
    }

    for (const sym of baseSymbols) {
      candidates.add(`${sym}.NS`);  // NSE
      candidates.add(`${sym}.BO`);  // BSE
      candidates.add(sym);           // US / direct
    }

    let result: NormalizedQuote | null = null;
    const triedSymbols: string[] = [];

    for (const symbol of candidates) {
      triedSymbols.push(symbol);
      console.log("Trying Yahoo:", symbol);
      result = await fetchYahooQuote(symbol);
      if (result) {
        console.log(`✓ Found price for ${symbol}: ${result.price}`);
        break;
      }
    }

    if (!result) {
      // Fallback: return last stored price
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
        error: `Could not fetch live quote for ${normalizedTicker}`,
        tried_symbols: triedSymbols,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store in DB
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
