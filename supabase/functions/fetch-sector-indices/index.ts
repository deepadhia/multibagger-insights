import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Nifty sector indices available on Yahoo Finance
const SECTOR_INDICES: Array<{ name: string; symbol: string; sector: string }> = [
  { name: "Nifty 50", symbol: "^NSEI", sector: "Broad Market" },
  { name: "Nifty Bank", symbol: "^NSEBANK", sector: "Banking" },
  { name: "Nifty IT", symbol: "^CNXIT", sector: "IT" },
  { name: "Nifty Pharma", symbol: "^CNXPHARMA", sector: "Pharma" },
  { name: "Nifty Auto", symbol: "^CNXAUTO", sector: "Auto" },
  { name: "Nifty FMCG", symbol: "^CNXFMCG", sector: "FMCG" },
  { name: "Nifty Metal", symbol: "^CNXMETAL", sector: "Metal" },
  { name: "Nifty Realty", symbol: "^CNXREALTY", sector: "Realty" },
  { name: "Nifty Energy", symbol: "^CNXENERGY", sector: "Energy" },
  { name: "Nifty Infra", symbol: "^CNXINFRA", sector: "Infra" },
  { name: "Nifty PSU Bank", symbol: "^CNXPSUBANK", sector: "PSU Bank" },
  { name: "Nifty Media", symbol: "^CNXMEDIA", sector: "Media" },
  { name: "Nifty Fin Service", symbol: "NIFTY_FIN_SERVICE.NS", sector: "Financial Services" },
  { name: "Nifty Healthcare", symbol: "NIFTY_HEALTHCARE.NS", sector: "Healthcare" },
  { name: "Nifty Midcap 100", symbol: "^NSEMDCP50", sector: "Midcap" },
  { name: "Nifty Smallcap 100", symbol: "^CNXSC", sector: "Smallcap" },
];

const formatDate = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toISOString().slice(0, 10);

async function fetchIndexHistory(symbol: string): Promise<Array<{ date: string; price: number }>> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3y`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      console.log(`Yahoo ${response.status} for ${symbol}`);
      return [];
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;

    if (!timestamps || !closes) return [];

    const prices: Array<{ date: string; price: number }> = [];
    for (let i = 0; i < timestamps.length; i++) {
      const price = Number(closes[i]);
      if (!Number.isFinite(price) || price <= 0) continue;
      prices.push({ date: formatDate(timestamps[i]), price: Math.round(price * 100) / 100 });
    }
    return prices;
  } catch (e) {
    console.log(`Error fetching ${symbol}:`, e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: Array<{ index: string; success: boolean; inserted?: number }> = [];

    for (const idx of SECTOR_INDICES) {
      try {
        await new Promise(r => setTimeout(r, 1000)); // Rate limit
        console.log(`Fetching ${idx.name} (${idx.symbol})...`);

        const history = await fetchIndexHistory(idx.symbol);
        if (history.length === 0) {
          console.log(`No data for ${idx.symbol}`);
          results.push({ index: idx.name, success: false });
          continue;
        }

        // Get existing dates
        const { data: existing } = await supabase
          .from("sector_indices")
          .select("date")
          .eq("index_symbol", idx.symbol);

        const existingDates = new Set((existing || []).map(e => e.date));

        const newRows = history
          .filter(h => !existingDates.has(h.date))
          .map(h => ({
            index_name: idx.name,
            index_symbol: idx.symbol,
            sector: idx.sector,
            date: h.date,
            price: h.price,
          }));

        if (newRows.length > 0) {
          for (let i = 0; i < newRows.length; i += 100) {
            await supabase.from("sector_indices").insert(newRows.slice(i, i + 100));
          }
        }

        console.log(`✓ ${idx.name}: ${newRows.length} new records`);
        results.push({ index: idx.name, success: true, inserted: newRows.length });
      } catch (e) {
        console.error(`Error for ${idx.name}:`, e);
        results.push({ index: idx.name, success: false });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return new Response(JSON.stringify({
      message: `Updated ${successCount}/${SECTOR_INDICES.length} sector indices`,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-sector-indices error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
