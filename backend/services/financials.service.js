import { pool } from "../db/pool.js";

async function fetchScreenerPage(slug, sessionId, csrfToken) {
  const headers = {
    Cookie: `csrftoken=${csrfToken}; sessionid=${sessionId}`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.screener.in/",
  };
  const consolidatedUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/consolidated/`;
  const resp1 = await fetch(consolidatedUrl, { headers, redirect: "follow" });
  if (resp1.ok) return await resp1.text();
  const standaloneUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/`;
  const resp2 = await fetch(standaloneUrl, { headers, redirect: "follow" });
  if (resp2.ok) return await resp2.text();
  return null;
}

function extractTableData(html, sectionId) {
  const sectionRegex = new RegExp(`<section id="${sectionId}"[\\s\\S]*?<\\/section>`);
  const section = html.match(sectionRegex);
  if (!section) return { headers: [], rows: {} };
  const table = section[0].match(/<table[\s\S]*?<\/table>/);
  if (!table) return { headers: [], rows: {} };
  const headers = [];
  const thead = table[0].match(/<thead[\s\S]*?<\/thead>/);
  if (thead) {
    const ths = thead[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
    for (const th of ths) {
      const text = th.replace(/<[^>]+>/g, "").trim();
      if (text.match(/Mar \d{4}|Jun \d{4}|Sep \d{4}|Dec \d{4}|FY\d{2}|\d{4}|TTM/)) headers.push(text);
    }
  }
  const rows = {};
  const trs = table[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
  for (const tr of trs) {
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    if (tds.length === 0) continue;
    let label = tds[0].replace(/<[^>]+>/g, "").trim();
    label = label.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s*\+\s*$/, "").trim();
    if (!label) continue;
    const values = tds.slice(1).map((c) => {
      const raw = c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").replace(/,/g, "").replace(/%/g, "").trim();
      const num = parseFloat(raw);
      return isNaN(num) ? 0 : num;
    });
    rows[label] = values;
  }
  return { headers, rows };
}

function findRow(rows, ...keywords) {
  for (const key of Object.keys(rows)) {
    const lower = key.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw))) return rows[key];
  }
  return [];
}

function parseScreenerData(html) {
  const ratios = {};
  const ratioSection = html.match(/<ul id="top-ratios">([\s\S]*?)<\/ul>/);
  if (ratioSection) {
    const liItems = ratioSection[1].match(/<li[\s\S]*?<\/li>/g) || [];
    for (const li of liItems) {
      const nameMatch = li.match(/<span class="name">\s*([\s\S]*?)\s*<\/span>/);
      const numberMatch = li.match(/<span class="number">([\d,\.\-]+)<\/span>/);
      if (nameMatch && numberMatch) {
        ratios[nameMatch[1].replace(/<[^>]+>/g, "").trim()] = numberMatch[1].replace(/,/g, "");
      }
    }
  }
  const promoterHolding = ratios["Promoter Holding"] ? parseFloat(ratios["Promoter Holding"]) : null;

  const pl = extractTableData(html, "profit-loss");
  const plYears = pl.headers.filter((h) => !h.includes("TTM"));
  const ttmIdx = pl.headers.indexOf("TTM");
  const filterTTM = (arr) => (ttmIdx >= 0 ? arr.filter((_, i) => i !== ttmIdx) : arr);
  const revenue = filterTTM(findRow(pl.rows, "sales", "revenue"));
  const netProfit = filterTTM(findRow(pl.rows, "net profit"));
  const opm = filterTTM(findRow(pl.rows, "opm"));
  const eps = filterTTM(findRow(pl.rows, "eps"));

  let ratiosTable = extractTableData(html, "ratios");
  if (ratiosTable.headers.length === 0) ratiosTable = extractTableData(html, "ratio");
  const ratioYears = ratiosTable.headers.filter((h) => !h.includes("TTM"));
  const roceRow = findRow(ratiosTable.rows, "roce");
  const ratioTTMIdx = ratiosTable.headers.indexOf("TTM");
  const roceYearly = ratioTTMIdx >= 0 ? roceRow.filter((_, i) => i !== ratioTTMIdx) : roceRow;

  const bs = extractTableData(html, "balance-sheet");
  const bsYears = bs.headers.filter((h) => !h.includes("TTM"));
  const bsTTMIdx = bs.headers.indexOf("TTM");
  const borrowingsRow = findRow(bs.rows, "borrowings", "total debt", "long term borrowings");
  const equityRow = findRow(bs.rows, "equity capital", "share capital");
  const reservesRow = findRow(bs.rows, "reserves");
  const borrowings = bsTTMIdx >= 0 ? borrowingsRow.filter((_, i) => i !== bsTTMIdx) : borrowingsRow;
  const equityCap = bsTTMIdx >= 0 ? equityRow.filter((_, i) => i !== bsTTMIdx) : equityRow;
  const reserves = bsTTMIdx >= 0 ? reservesRow.filter((_, i) => i !== bsTTMIdx) : reservesRow;
  const computedRoe = [];
  const computedDE = [];
  for (let i = 0; i < bsYears.length; i++) {
    const totalEquity = (equityCap[i] || 0) + (reserves[i] || 0);
    const debt = borrowings[i] || 0;
    const yearMatch = bsYears[i]?.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
    const plIdx = plYears.findIndex((h) => h.includes(String(year)));
    const np = plIdx >= 0 ? netProfit[plIdx] : 0;
    computedRoe.push(totalEquity > 0 && np ? Math.round((np / totalEquity) * 100 * 10) / 10 : null);
    computedDE.push(totalEquity > 0 ? Math.round((debt / totalEquity) * 100) / 100 : null);
  }

  const cf = extractTableData(html, "cash-flow");
  const cfYears = cf.headers.filter((h) => !h.includes("TTM"));
  const cfTTMIdx = cf.headers.indexOf("TTM");
  const cfoRow = findRow(cf.rows, "cash from operating", "operating activity");
  const capexRow = findRow(cf.rows, "fixed assets purchased", "capex", "fixed assets");
  const cfo = cfTTMIdx >= 0 ? cfoRow.filter((_, i) => i !== cfTTMIdx) : cfoRow;
  const capex = cfTTMIdx >= 0 ? capexRow.filter((_, i) => i !== cfTTMIdx) : capexRow;

  const sh = extractTableData(html, "shareholding");
  const shQuarters = sh.headers;
  const promoterRow = findRow(sh.rows, "promoter");
  const fiiRow = findRow(sh.rows, "fii", "foreign");
  const diiRow = findRow(sh.rows, "dii", "domestic");
  const publicRow = findRow(sh.rows, "public");
  const othersRow = findRow(sh.rows, "other", "government");

  const shareholding = shQuarters.map((q, i) => ({
    quarter: q,
    promoters: promoterRow[i] ?? null,
    fiis: fiiRow[i] ?? null,
    diis: diiRow[i] ?? null,
    public_holding: publicRow[i] ?? null,
    others: othersRow[i] ?? null,
  }));

  const promoterByYear = new Map();
  for (let i = 0; i < shQuarters.length; i++) {
    const qLabel = shQuarters[i];
    const yearMatch = qLabel.match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1], 10);
    const val = promoterRow[i];
    if (!val || val === 0) continue;
    if (qLabel.includes("Mar")) promoterByYear.set(year, val);
    else if (!promoterByYear.has(year)) promoterByYear.set(year, val);
  }

  const yearlyMap = new Map();
  for (let i = 0; i < plYears.length; i++) {
    const yearMatch = plYears[i].match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1], 10);
    const revGrowth =
      i > 0 && revenue[i - 1] > 0
        ? Math.round(((revenue[i] - revenue[i - 1]) / revenue[i - 1]) * 100 * 10) / 10
        : null;
    const profGrowth =
      i > 0 && netProfit[i - 1] > 0
        ? Math.round(((netProfit[i] - netProfit[i - 1]) / netProfit[i - 1]) * 100 * 10) / 10
        : null;
    yearlyMap.set(year, {
      year,
      revenue: revenue[i] || null,
      net_profit: netProfit[i] || null,
      opm: opm[i] || null,
      eps: eps[i] || null,
      revenue_growth: revGrowth,
      profit_growth: profGrowth,
      roce: null,
      roe: null,
      debt_equity: null,
      free_cash_flow: null,
      promoter_holding: promoterByYear.get(year) ?? null,
    });
  }
  for (let i = 0; i < ratioYears.length; i++) {
    const yearMatch = ratioYears[i].match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1], 10);
    const entry = yearlyMap.get(year);
    if (entry) entry.roce = roceYearly[i] || null;
  }
  for (let i = 0; i < bsYears.length; i++) {
    const yearMatch = bsYears[i].match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1], 10);
    const entry = yearlyMap.get(year);
    if (entry) {
      if (computedRoe[i] !== null) entry.roe = computedRoe[i];
      if (computedDE[i] !== null) entry.debt_equity = computedDE[i];
    }
  }
  for (let i = 0; i < cfYears.length; i++) {
    const yearMatch = cfYears[i].match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1], 10);
    const entry = yearlyMap.get(year);
    if (entry) entry.free_cash_flow = Math.round(((cfo[i] || 0) - Math.abs(capex[i] || 0)) * 10) / 10;
  }
  if (promoterRow.length > 0 && yearlyMap.size > 0) {
    const sortedYears = Array.from(yearlyMap.keys()).sort((a, b) => a - b);
    const latestYear = sortedYears[sortedYears.length - 1];
    const latestEntry = yearlyMap.get(latestYear);
    if (latestEntry && latestEntry.promoter_holding === null)
      latestEntry.promoter_holding = promoterRow[promoterRow.length - 1] || null;
  }
  if (promoterHolding !== null && yearlyMap.size > 0) {
    const sortedYears = Array.from(yearlyMap.keys()).sort((a, b) => a - b);
    const latestEntry = yearlyMap.get(sortedYears[sortedYears.length - 1]);
    if (latestEntry && latestEntry.promoter_holding === null) latestEntry.promoter_holding = promoterHolding;
  }

  const yearly = Array.from(yearlyMap.values()).sort((a, b) => a.year - b.year);

  const qr = extractTableData(html, "quarters");
  const quarters = qr.headers;
  const qRevenue = findRow(qr.rows, "sales", "revenue");
  const qOpm = findRow(qr.rows, "opm", "operating profit margin");
  const quarterly = quarters.map((q, i) => ({
    quarter: q,
    revenue: qRevenue[i] ?? null,
    ebitda_margin: qOpm[i] ?? null,
    debt: null,
    capex: null,
  }));

  const peers = [];
  const peerRows = html.match(/<tr\s+data-row-company-id="[^"]*"[\s\S]*?<\/tr>/g) || [];
  const parseVal = (cell) => {
    const raw = (cell || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, "")
      .replace(/,/g, "")
      .replace(/%/g, "")
      .trim();
    const num = parseFloat(raw);
    return isNaN(num) ? null : num;
  };
  for (const tr of peerRows) {
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    if (tds.length < 10) continue;
    const nameCell = tds[1] || "";
    const nameMatch = nameCell.match(/<a[^>]*href="\/company\/([^/"]+)/);
    const peerSlug = nameMatch ? nameMatch[1] : null;
    const peerName = nameCell.replace(/<[^>]+>/g, "").trim();
    if (!peerName) continue;
    peers.push({
      peer_name: peerName,
      peer_slug: peerSlug,
      cmp: parseVal(tds[2]),
      pe: parseVal(tds[3]),
      market_cap: parseVal(tds[4]),
      div_yield: parseVal(tds[5]),
      np_qtr: parseVal(tds[6]),
      qtr_profit_var: parseVal(tds[7]),
      sales_qtr: parseVal(tds[8]),
      qtr_sales_var: parseVal(tds[9]),
      roce: parseVal(tds[10]),
    });
  }

  return { ratios, yearly, quarterly, shareholding, peers };
}

/**
 * Fetch Screener page for a stock, parse financials, and store in DB.
 * @param {{ stock_id: string, ticker: string, screener_slug?: string }} opts
 * @returns {Promise<{ success: boolean; error?: string; ratios?: object; yearly?: any[]; quarterly?: any[]; shareholding?: any[]; peers?: any[] }>}
 */
export async function fetchAndStoreFinancials({ stock_id, ticker, screener_slug }) {
  const sessionId = process.env.SCREENER_SESSION_ID;
  const csrfToken = process.env.SCREENER_CSRF_TOKEN;
  if (!sessionId || !csrfToken) {
    return { success: false, error: "Screener.in credentials not configured (SCREENER_SESSION_ID, SCREENER_CSRF_TOKEN)" };
  }
  const slug = screener_slug || ticker;
  let html = await fetchScreenerPage(slug, sessionId, csrfToken);
  if (!html && screener_slug && screener_slug !== ticker) {
    html = await fetchScreenerPage(ticker, sessionId, csrfToken);
  }
  if (!html) {
    return {
      success: false,
      error: `Could not find company "${slug}" on Screener.in. Check screener_slug.`,
    };
  }

  const metrics = parseScreenerData(html);

  for (const m of metrics.yearly) {
    await pool.query(
      `INSERT INTO financial_metrics (stock_id, year, revenue, net_profit, opm, eps, revenue_growth, profit_growth, roce, roe, debt_equity, promoter_holding, free_cash_flow)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (stock_id, year) DO UPDATE SET
         revenue = EXCLUDED.revenue, net_profit = EXCLUDED.net_profit, opm = EXCLUDED.opm, eps = EXCLUDED.eps,
         revenue_growth = EXCLUDED.revenue_growth, profit_growth = EXCLUDED.profit_growth,
         roce = EXCLUDED.roce, roe = EXCLUDED.roe, debt_equity = EXCLUDED.debt_equity,
         promoter_holding = EXCLUDED.promoter_holding, free_cash_flow = EXCLUDED.free_cash_flow`,
      [
        stock_id,
        m.year,
        m.revenue,
        m.net_profit,
        m.opm,
        m.eps,
        m.revenue_growth,
        m.profit_growth,
        m.roce,
        m.roe,
        m.debt_equity,
        m.promoter_holding,
        m.free_cash_flow,
      ],
    );
  }

  for (const q of metrics.quarterly) {
    await pool.query(
      `INSERT INTO financial_results (stock_id, quarter, revenue, ebitda_margin, debt, capex)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (stock_id, quarter) DO UPDATE SET
         revenue = EXCLUDED.revenue, ebitda_margin = EXCLUDED.ebitda_margin, debt = EXCLUDED.debt, capex = EXCLUDED.capex`,
      [stock_id, q.quarter, q.revenue, q.ebitda_margin, q.debt, q.capex],
    );
  }

  for (const sh of metrics.shareholding) {
    await pool.query(
      `INSERT INTO shareholding (stock_id, quarter, promoters, fiis, diis, public_holding, others)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (stock_id, quarter) DO UPDATE SET
         promoters = EXCLUDED.promoters, fiis = EXCLUDED.fiis, diis = EXCLUDED.diis,
         public_holding = EXCLUDED.public_holding, others = EXCLUDED.others`,
      [stock_id, sh.quarter, sh.promoters, sh.fiis, sh.diis, sh.public_holding, sh.others],
    );
  }

  await pool.query("DELETE FROM peer_comparison WHERE stock_id = $1", [stock_id]);
  for (const peer of metrics.peers) {
    await pool.query(
      `INSERT INTO peer_comparison (stock_id, peer_name, peer_slug, cmp, pe, market_cap, div_yield, np_qtr, qtr_profit_var, sales_qtr, qtr_sales_var, roce)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (stock_id, peer_name) DO UPDATE SET
         peer_slug = EXCLUDED.peer_slug, cmp = EXCLUDED.cmp, pe = EXCLUDED.pe, market_cap = EXCLUDED.market_cap,
         div_yield = EXCLUDED.div_yield, np_qtr = EXCLUDED.np_qtr, qtr_profit_var = EXCLUDED.qtr_profit_var,
         sales_qtr = EXCLUDED.sales_qtr, qtr_sales_var = EXCLUDED.qtr_sales_var, roce = EXCLUDED.roce`,
      [
        stock_id,
        peer.peer_name,
        peer.peer_slug,
        peer.cmp,
        peer.pe,
        peer.market_cap,
        peer.div_yield,
        peer.np_qtr,
        peer.qtr_profit_var,
        peer.sales_qtr,
        peer.qtr_sales_var,
        peer.roce,
      ],
    );
  }

  return {
    success: true,
    ratios: metrics.ratios,
    yearly: metrics.yearly,
    quarterly: metrics.quarterly,
    shareholding: metrics.shareholding,
    peers: metrics.peers,
  };
}
