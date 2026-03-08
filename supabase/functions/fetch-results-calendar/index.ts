const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BSE_API = 'https://api.bseindia.com/BseIndiaAPI/api';
const BSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.bseindia.com/',
  'Origin': 'https://www.bseindia.com',
};

const NSE_BASE = 'https://www.nseindia.com';
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

async function getNSECookies(): Promise<string> {
  const resp = await fetch(NSE_BASE, { headers: NSE_HEADERS, redirect: 'follow' });
  await resp.text();
  const cookies = resp.headers.get('set-cookie') || '';
  return cookies.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get all tracked stocks
    const { data: stocks, error: stocksErr } = await supabase
      .from('stocks')
      .select('id, ticker, company_name');
    if (stocksErr) throw stocksErr;
    if (!stocks?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No stocks to check', updated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build lookup maps for matching
    const tickerToStock = new Map<string, typeof stocks[0]>();
    const nameWords = new Map<string, typeof stocks[0]>();
    for (const s of stocks) {
      tickerToStock.set(s.ticker.toUpperCase(), s);
      // Also map by first significant word of company name for fuzzy matching
      const words = s.company_name.toUpperCase().split(/\s+/).filter(w => w.length > 2 && !['LTD', 'LIMITED', 'PVT', 'PRIVATE', 'INC', 'CORP', 'THE'].includes(w));
      if (words.length > 0) {
        nameWords.set(words[0], s);
      }
    }

    let updated = 0;
    const matched: Array<{ ticker: string; date: string; source: string }> = [];
    const matchedIds = new Set<string>();

    // === SOURCE 1: BSE Forthcoming Results Calendar ===
    console.log('Fetching BSE forthcoming results...');
    try {
      const bseResp = await fetch(`${BSE_API}/Corpforthresults/w`, { headers: BSE_HEADERS });
      if (bseResp.ok) {
        const bseData = await bseResp.json();
        console.log(`BSE returned ${Array.isArray(bseData) ? bseData.length : 0} forthcoming results`);

        if (Array.isArray(bseData)) {
          for (const item of bseData) {
            const bseName = (item.short_name || item.Long_Name || '').toUpperCase();
            const meetingDate = item.meeting_date || '';

            // Parse date like "23 Oct 2023" or "13 Mar 2026"
            let parsedDate: Date | null = null;
            try {
              parsedDate = new Date(meetingDate);
              if (isNaN(parsedDate.getTime())) continue;
            } catch {
              continue;
            }

            const dateStr = parsedDate.toISOString().split('T')[0];
            const now = new Date();
            if (parsedDate < now) continue; // Skip past dates

            // Try to match by ticker or company name
            let matchedStock: typeof stocks[0] | undefined;

            // Direct ticker match with BSE short_name
            for (const [ticker, stock] of tickerToStock) {
              if (bseName.includes(ticker) || ticker.includes(bseName.replace(/\s+/g, ''))) {
                matchedStock = stock;
                break;
              }
            }

            // Fuzzy name match
            if (!matchedStock) {
              const bseWords = bseName.split(/\s+/).filter(w => w.length > 2 && !['LTD', 'LIMITED', 'PVT', 'PRIVATE', 'INC', 'CORP', 'THE'].includes(w));
              for (const bw of bseWords) {
                if (nameWords.has(bw)) {
                  matchedStock = nameWords.get(bw);
                  break;
                }
              }
            }

            if (matchedStock && !matchedIds.has(matchedStock.id)) {
              matchedIds.add(matchedStock.id);
              const { error } = await supabase
                .from('stocks')
                .update({ next_results_date: dateStr })
                .eq('id', matchedStock.id);
              if (!error) {
                updated++;
                matched.push({ ticker: matchedStock.ticker, date: dateStr, source: 'BSE' });
              }
            }
          }
        }
      } else {
        console.log('BSE API response:', bseResp.status);
      }
    } catch (e) {
      console.error('BSE fetch error:', e);
    }

    // === SOURCE 2: NSE Board Meetings (supplementary) ===
    console.log('Fetching NSE board meetings...');
    try {
      const cookies = await getNSECookies();
      const authHeaders = { ...NSE_HEADERS, Cookie: cookies };
      const bmResp = await fetch(`${NSE_BASE}/api/corporate-board-meetings?index=equities`, { headers: authHeaders });
      if (bmResp.ok) {
        const bmData = await bmResp.json();
        const meetings = Array.isArray(bmData) ? bmData : [];
        console.log(`NSE returned ${meetings.length} board meetings`);

        for (const m of meetings) {
          const symbol = (m.bm_symbol || m.symbol || '').toUpperCase();
          const purpose = (m.bm_purpose || m.purpose || '').toLowerCase();
          const dateStr = m.bm_date || m.meetingDate || m.date || '';

          if (!purpose.includes('financial result') && !purpose.includes('quarterly') && !purpose.includes('audited') && !purpose.includes('un-audited')) continue;

          let meetDate: Date | null = null;
          try {
            meetDate = new Date(dateStr);
            if (isNaN(meetDate.getTime())) continue;
          } catch {
            continue;
          }

          const meetDateStr = meetDate.toISOString().split('T')[0];
          if (meetDate < new Date()) continue;

          const stock = tickerToStock.get(symbol);
          if (stock && !matchedIds.has(stock.id)) {
            matchedIds.add(stock.id);
            const { error } = await supabase
              .from('stocks')
              .update({ next_results_date: meetDateStr })
              .eq('id', stock.id);
            if (!error) {
              updated++;
              matched.push({ ticker: stock.ticker, date: meetDateStr, source: 'NSE' });
            }
          }
        }
      }
    } catch (e) {
      console.error('NSE fetch error:', e);
    }

    return new Response(JSON.stringify({
      success: true,
      updated,
      total_stocks: stocks.length,
      matched,
      message: `Updated ${updated} of ${stocks.length} stocks with upcoming results dates`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
