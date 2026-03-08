const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    // Get NSE cookies
    let cookies: string;
    try {
      cookies = await getNSECookies();
    } catch (e) {
      console.error('Failed to get NSE cookies:', e);
      return new Response(JSON.stringify({ success: false, error: 'Failed to connect to NSE' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeaders = { ...NSE_HEADERS, Cookie: cookies };
    const today = new Date();
    let updated = 0;
    const results: Array<{ ticker: string; date: string | null }> = [];

    // Fetch board meetings from NSE corporate info
    // NSE provides a board meetings endpoint that lists upcoming quarterly results
    const bmUrl = `${NSE_BASE}/api/corporate-board-meetings?index=equities`;
    console.log('Fetching board meetings:', bmUrl);

    let allMeetings: any[] = [];
    try {
      const bmResp = await fetch(bmUrl, { headers: authHeaders });
      if (bmResp.ok) {
        const bmData = await bmResp.json();
        allMeetings = Array.isArray(bmData) ? bmData : [];
        console.log(`Got ${allMeetings.length} board meetings from NSE`);
      } else {
        const t = await bmResp.text();
        console.error('Board meetings response:', bmResp.status, t.substring(0, 300));
      }
    } catch (e) {
      console.error('Board meetings fetch error:', e);
    }

    // Build a map: ticker -> nearest future meeting date for \"Financial Results\"
    const tickerMap = new Map<string, string>();
    for (const m of allMeetings) {
      const symbol = (m.bm_symbol || m.symbol || '').toUpperCase();
      const purpose = (m.bm_purpose || m.purpose || '').toLowerCase();
      const dateStr = m.bm_date || m.meetingDate || m.date || '';

      // Only consider meetings related to financial results
      if (!purpose.includes('financial result') && !purpose.includes('quarterly') && !purpose.includes('audited') && !purpose.includes('un-audited')) {
        continue;
      }

      // Parse the date
      let meetDate: Date | null = null;
      try {
        meetDate = new Date(dateStr);
        if (isNaN(meetDate.getTime())) {
          // Try DD-Mon-YYYY format
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            meetDate = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
          }
        }
      } catch {
        continue;
      }

      if (!meetDate || isNaN(meetDate.getTime())) continue;

      // Only future or today's meetings
      const meetDateStr = meetDate.toISOString().split('T')[0];
      if (meetDate < today && meetDateStr !== today.toISOString().split('T')[0]) continue;

      // Keep the nearest future date for each ticker
      const existing = tickerMap.get(symbol);
      if (!existing || meetDateStr < existing) {
        tickerMap.set(symbol, meetDateStr);
      }
    }

    console.log(`Found upcoming results for ${tickerMap.size} tickers:`, Object.fromEntries(tickerMap));

    // Update stocks
    for (const stock of stocks) {
      const ticker = stock.ticker.toUpperCase();
      const nextDate = tickerMap.get(ticker) || null;

      if (nextDate) {
        const { error } = await supabase
          .from('stocks')
          .update({ next_results_date: nextDate })
          .eq('id', stock.id);
        if (error) {
          console.error(`Failed to update ${ticker}:`, error);
        } else {
          updated++;
          results.push({ ticker, date: nextDate });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      updated,
      total_meetings: allMeetings.length,
      matched: results,
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
