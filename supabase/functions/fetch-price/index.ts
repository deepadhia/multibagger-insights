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

type NormalizedQuote = {
  symbol: string;
  price: number;
  volume: number | null;
  change_percent: number | null;
  date: string;
  source: "alpha_vantage" | "yahoo" | "database";
};

const parseNumber = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const formatDate = (epochSeconds?: number) => {
  if (!epochSeconds) return new Date().toISOString().slice(0, 10);
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
};

async function fetchGlobalQuote(apiKey: string, symbol: string): Promise<QuoteResult> {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data?.["Error Message"] || data?.["Note"] || data?.["Information"]) {
    console.log("GLOBAL_QUOTE error for", symbol, ":", data?.["Error Message"] || data?.["Note"] || data?.["Information"]);
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

  if (data?.["Error Message"] || data?.["Note"] || data?.["Information"] || !Array.isArray(data?.bestMatches)) {
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

async function fetchYahooQuote(symbol: string): Promise<NormalizedQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const response = await fetch(url);

  if (!response.ok) return null;

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
    volume: Number.isFinite(meta?.regularMarketVolume) ? Number(meta?.regularMarketVolume) : null,
    change_percent: changePercent,
    date: formatDate(Number(meta?.regularMarketTime)),
    source: "yahoo",
  };
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

    const alphaCandidates = new Set<string>([
      normalizedTicker,
      `${normalizedTicker}.NSE`,
      `${normalizedTicker}.BSE`,
      `${normalizedTicker}.NS`,
      `${normalizedTicker}.BO`,
    ]);

    if (screenerSlug) {
      alphaCandidates.add(screenerSlug);
      alphaCandidates.add(`${screenerSlug}.NSE`);
      alphaCandidates.add(`${screenerSlug}.BSE`);
      alphaCandidates.add(`${screenerSlug}.NS`);
      alphaCandidates.add(`${screenerSlug}.BO`);
    }

    let normalizedResult: NormalizedQuote | null = null;
    const triedSymbols: string[] = [];

    for (const symbol of alphaCandidates) {
      triedSymbols.push(symbol);
      console.log("Trying alpha ticker:", symbol);
      const foundQuote = await fetchGlobalQuote(alphaKey, symbol);
      if (foundQuote) {
        const { quote } = foundQuote;
        const price = parseNumber(quote["05. price"]);
        if (!price) break;

        normalizedResult = {
          symbol,
          price,
          volume: parseNumber(quote["06. volume"]),
          change_percent: parseNumber((quote["10. change percent"] || "").replace("%", "")),
          date: quote["07. latest trading day"] || new Date().toISOString().slice(0, 10),
          source: "alpha_vantage",
        };
        break;
      }
    }

    if (!normalizedResult) {
      const discoveryKeywords = [normalizedTicker, screenerSlug].filter(Boolean) as string[];
      for (const keyword of discoveryKeywords) {
        const discovered = await discoverSymbols(alphaKey, keyword);
        for (const symbol of discovered) {
          if (triedSymbols.includes(symbol)) continue;
          triedSymbols.push(symbol);
          console.log("Trying discovered alpha symbol:", symbol);
          const foundQuote = await fetchGlobalQuote(alphaKey, symbol);
          if (foundQuote) {
            const { quote } = foundQuote;
            const price = parseNumber(quote["05. price"]);
            if (!price) continue;

            normalizedResult = {
              symbol,
              price,
              volume: parseNumber(quote["06. volume"]),
              change_percent: parseNumber((quote["10. change percent"] || "").replace("%", "")),
              date: quote["07. latest trading day"] || new Date().toISOString().slice(0, 10),
              source: "alpha_vantage",
            };
            break;
          }
        }
        if (normalizedResult) break;
      }
    }

    if (!normalizedResult) {
      const yahooCandidates = new Set<string>([
        normalizedTicker,
        `${normalizedTicker}.NS`,
        `${normalizedTicker}.BO`,
      ]);

      if (screenerSlug) {
        yahooCandidates.add(screenerSlug);
        yahooCandidates.add(`${screenerSlug}.NS`);
        yahooCandidates.add(`${screenerSlug}.BO`);
      }

      for (const symbol of yahooCandidates) {
        if (!triedSymbols.includes(symbol)) triedSymbols.push(symbol);
        console.log("Trying yahoo ticker:", symbol);
        const yahooResult = await fetchYahooQuote(symbol);
        if (yahooResult) {
          normalizedResult = yahooResult;
          break;
        }
      }
    }

    if (!normalizedResult) {
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

    if (supabase && stockId) {
      await supabase.from("prices").insert({
        stock_id: stockId,
        price: normalizedResult.price,
        volume: normalizedResult.volume,
        change_percent: normalizedResult.change_percent,
        date: normalizedResult.date,
      });
    }

    return new Response(JSON.stringify({ success: true, ...normalizedResult }), {
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
