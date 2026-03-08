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

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, stock_id } = await req.json();
    if (!ticker || !stock_id) {
      return new Response(JSON.stringify({ success: false, error: 'ticker and stock_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get NSE cookies
    let cookies: string;
    try {
      cookies = await getNSECookies();
    } catch (e) {
      console.error('Failed to get NSE cookies:', e);
      return new Response(JSON.stringify({ success: false, error: 'Failed to connect to NSE. Try again later.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeaders = { ...NSE_HEADERS, Cookie: cookies };
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 1);
    const from = formatDate(fromDate);
    const to = formatDate(toDate);

    const results = { bulk_deals: 0, block_deals: 0, insider_trades: 0 };

    // 1. Fetch Bulk Deals
    try {
      const bulkUrl = `${NSE_BASE}/api/historical/bulk-deals?from=${from}&to=${to}&symbol=${encodeURIComponent(ticker)}`;
      console.log('Fetching bulk deals:', bulkUrl);
      const bulkResp = await fetch(bulkUrl, { headers: authHeaders });
      if (bulkResp.ok) {
        const bulkData = await bulkResp.json();
        if (Array.isArray(bulkData) && bulkData.length > 0) {
          const rows = bulkData.map((d: any) => ({
            stock_id,
            deal_type: 'bulk',
            deal_date: d.BD_DT_DATE || d.date || d.Date,
            client_name: d.BD_CLIENT_NAME || d.clientName || d.Client || 'Unknown',
            buy_sell: d.BD_BUY_SELL || d.buySell || d.Type || null,
            quantity: parseFloat(d.BD_QTY_TRD || d.quantity || d.Quantity) || null,
            avg_price: parseFloat(d.BD_TP_WATP || d.avgPrice || d.Price) || null,
            trade_value: null,
            exchange: 'NSE',
            remarks: d.BD_REMARKS || d.remarks || null,
          }));
          const { error } = await supabase.from('bulk_deals').upsert(rows, { onConflict: 'stock_id,deal_date,client_name,deal_type' });
          if (error) console.error('Bulk deals upsert error:', error);
          else results.bulk_deals = rows.length;
        }
      } else {
        const t = await bulkResp.text();
        console.log('Bulk deals response:', bulkResp.status, t.substring(0, 200));
      }
    } catch (e) {
      console.error('Bulk deals fetch error:', e);
    }

    // 2. Fetch Block Deals
    try {
      const blockUrl = `${NSE_BASE}/api/block-deal`;
      console.log('Fetching block deals');
      const blockResp = await fetch(blockUrl, { headers: authHeaders });
      if (blockResp.ok) {
        const blockData = await blockResp.json();
        const deals = Array.isArray(blockData) ? blockData : blockData?.data || [];
        const filtered = deals.filter((d: any) =>
          (d.symbol || d.SYMBOL || '').toUpperCase() === ticker.toUpperCase()
        );
        if (filtered.length > 0) {
          const rows = filtered.map((d: any) => ({
            stock_id,
            deal_type: 'block',
            deal_date: d.BD_DT_DATE || d.date || new Date().toISOString().split('T')[0],
            client_name: d.BD_CLIENT_NAME || d.clientName || 'Unknown',
            buy_sell: d.BD_BUY_SELL || d.buySell || null,
            quantity: parseFloat(d.BD_QTY_TRD || d.quantity) || null,
            avg_price: parseFloat(d.BD_TP_WATP || d.avgPrice) || null,
            trade_value: null,
            exchange: 'NSE',
            remarks: null,
          }));
          const { error } = await supabase.from('bulk_deals').insert(rows);
          if (error) console.error('Block deals insert error:', error);
          else results.block_deals = rows.length;
        }
      } else {
        const t = await blockResp.text();
        console.log('Block deals response:', blockResp.status, t.substring(0, 200));
      }
    } catch (e) {
      console.error('Block deals fetch error:', e);
    }

    // 3. Fetch Insider Trading (PIT)
    try {
      const pitUrl = `${NSE_BASE}/api/corporates-pit?index=equities&from_date=${from}&to_date=${to}&symbol=${encodeURIComponent(ticker)}`;
      console.log('Fetching insider trades:', pitUrl);
      const pitResp = await fetch(pitUrl, { headers: authHeaders });
      if (pitResp.ok) {
        const pitData = await pitResp.json();
        const trades = Array.isArray(pitData) ? pitData : pitData?.data || [];
        if (trades.length > 0) {
          // Log first trade to inspect available fields
          if (trades.length > 0) {
            console.log('PIT sample fields:', JSON.stringify(Object.keys(trades[0])));
            console.log('PIT sample data:', JSON.stringify(trades[0]));
          }
          const rows = trades.map((d: any) => {
            const numSec = parseFloat(d.secAcq || d.noOfSecurities || d.securitiesAcquired) || null;
            const tradeVal = parseFloat(d.secVal || d.valueOfSecurity) || null;
            // Calculate avg_price: value / quantity
            const calcPrice = (tradeVal && numSec && numSec > 0) ? Math.round((tradeVal / numSec) * 100) / 100 : null;
            return {
              stock_id,
              trade_type: d.tkdAcquisitionfromDt ? 'sast' : 'insider',
              person_name: d.acqName || d.acquirerName || 'Unknown',
              person_category: d.personCategory || d.categoryOfPerson || null,
              trade_date: d.acquisitionfromDt || d.date || new Date().toISOString().split('T')[0],
              securities_type: d.secType || d.typeOfSecurity || null,
              num_securities: numSec,
              avg_price: calcPrice,
              trade_value: tradeVal,
              mode_of_acquisition: d.tdpTransactionType || d.modeOfAcquisition || null,
              exchange: 'NSE',
            };
          });
          const { error } = await supabase.from('insider_trades').insert(rows);
          if (error) console.error('Insider trades insert error:', error);
          else results.insider_trades = rows.length;
        }
      } else {
        const t = await pitResp.text();
        console.log('PIT response:', pitResp.status, t.substring(0, 200));
      }
    } catch (e) {
      console.error('Insider trades fetch error:', e);
    }

    return new Response(JSON.stringify({
      success: true,
      ...results,
      message: `Fetched ${results.bulk_deals} bulk, ${results.block_deals} block deals, ${results.insider_trades} insider trades`,
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
