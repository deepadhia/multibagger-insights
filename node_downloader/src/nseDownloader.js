/**
 * NSE earnings + investor presentation downloader. Logic mirrors Python nse_filing_downloader:
 * - Same relevance filter (positive/negative keywords), same classification, same quarter inference.
 * - Only earnings_result and investor_presentation from NSE; concall comes from Screener.
 */
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import dayjs from "dayjs";
import {
  DATA_DIR,
  WATCHLIST,
  DEFAULT_HISTORY_DAYS,
  HISTORY_WINDOWS,
  NSE_HEADERS,
  REQUEST_DELAY_MS,
} from "./config.js";
import { ensureDirSync, readJsonSync, writeJsonSync, sleep } from "./utils.js";
import { eventDateToResultsQuarter } from "./quarterFromEventDate.js";

// Same categories and logic as Python nse_filing_downloader (earnings + presentation only; concall from Screener)
const ALLOWED_CATEGORIES = new Set(["earnings_result", "investor_presentation"]);

// NSE API uses attchmntText (Python spelling); support both
function getAttachmentText(ann) {
  return (ann.attchmntText ?? ann.attachmentText ?? "").trim();
}

/**
 * Mirror of Python is_relevant(): only keep PDFs that look like actual
 * transcripts/results/presentations, not intimation/schedule noise.
 */
function isRelevant(ann) {
  const attachUrl = (ann.attchmntFile ?? "").trim();
  if (
    !attachUrl ||
    attachUrl === "-" ||
    !attachUrl.startsWith("http")
  ) {
    return false;
  }
  const desc = (ann.desc ?? "").trim();
  const attText = getAttachmentText(ann);
  const combined = `${desc} ${attText}`.toLowerCase();

  // Keep this list fairly broad so we don't miss genuine
  // results / presentations, but rely on classifyFiling()
  // and ALLOWED_CATEGORIES to decide the final category.
  const positiveKeywords = [
    "concall",
    "con call",
    "con. call",
    "conference call",
    "earnings call",
    "transcript",
    "financial results",
    "financial result",
    "results for the quarter",
    "results for quarter",
    "quarterly results",
    "quarterly result",
    "annual results",
    "annual result",
    "outcome of board meeting",
    "outcome of the board meeting",
    "outcome of meeting",
    "board meeting held",
    "considered and approved the financial",
    "investor presentation",
    "earnings presentation",
    "presentation on financial results",
    "results presentation",
    "presentation",
  ];
  if (!positiveKeywords.some((kw) => combined.includes(kw))) {
    return false;
  }

  const negativeSnippets = [
    "schedule of meet",
    "schedule of meeting",
    "investor meet intimation",
    "intimation of investor meet",
    "intimation regarding investor meet",
    "intimation regarding analysts/ institutional investors meet",
    "invitation to investor meet",
  ];
  if (negativeSnippets.some((bad) => combined.includes(bad))) {
    return false;
  }

  return true;
}

/**
 * Same classification as Python classify_filing(); we only use
 * earnings_result and investor_presentation (concall comes from Screener).
 */
function classifyFiling(ann) {
  const desc = (ann.desc ?? "").toLowerCase();
  const text = `${desc} ${getAttachmentText(ann).toLowerCase()}`;

  if (
    ["transcript", "concall", "con call", "conference call", "earnings call"].some(
      (k) => text.includes(k),
    )
  ) {
    return "concall_transcript"; // filtered out by ALLOWED_CATEGORIES
  }
  if (text.includes("investor presentation") || text.includes("presentation")) {
    return "investor_presentation";
  }
  if (
    [
      "financial result",
      "quarterly result",
      "annual result",
      "board meeting",
    ].some((k) => text.includes(k))
  ) {
    return "earnings_result";
  }
  return null;
}

function inferQuarterForAnnouncement(ann) {
  const desc = (ann.desc ?? "").toLowerCase();
  const attText = getAttachmentText(ann).toLowerCase();
  const combined = `${desc} ${attText}`;

  // Patterns like "Q2 FY26" or "Q2FY26"
  const m1 = combined.match(/q([1-4])\s*fy\s*(\d{2}|\d{4})/i) || combined.match(/q([1-4])fy(\d{2}|\d{4})/i);
  if (m1) {
    const qNum = Number(m1[1]);
    const fy = m1[2].length === 2 ? m1[2] : String(m1[2]).slice(-2);
    if (qNum >= 1 && qNum <= 4) {
      return `FY${fy}-Q${qNum}`;
    }
  }

  // Patterns like "Quarter 3 FY2026" or "quarter 1 of FY26"
  const m2 = combined.match(/quarter\s*([1-4])\s*(?:of\s*)?fy\s*(\d{2}|\d{4})/i);
  if (m2) {
    const qNum = Number(m2[1]);
    const fy = m2[2].length === 2 ? m2[2] : String(m2[2]).slice(-2);
    if (qNum >= 1 && qNum <= 4) {
      return `FY${fy}-Q${qNum}`;
    }
  }

  // "Quarter ended 30 June 2025" / "quarter ended June 30, 2025" → Q1 FY26 (Indian FY)
  const quarterEnded = combined.match(/quarter\s+ended\s+(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:,\s*)?(\d{4})/i);
  if (quarterEnded) {
    const monthStr = (quarterEnded[2] || "").toLowerCase();
    const year = Number(quarterEnded[3]);
    const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const month = monthMap[monthStr];
    if (month && year) {
      const fyYear = month >= 4 ? year + 1 : year;
      let q = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 && month <= 12 ? 3 : 4;
      return `FY${String(fyYear).slice(-2)}-Q${q}`;
    }
  }

  // Fallback: use shared event-date → results-quarter rule (Jan→Q3, Apr→Q4, Jul→Q1, Oct→Q2).
  return eventDateToResultsQuarter(ann.sort_date || "");
}

/**
 * NSE requires a valid cookie/session from the homepage before API calls work.
 * Warm up the session like the Python version.
 */
async function createNseSession() {
  const session = axios.create({
    headers: { ...NSE_HEADERS },
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
  });

  let cookieStr = "";

  function applySetCookie(res) {
    const setCookie = res.headers["set-cookie"];
    if (setCookie) {
      const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
      const newPart = parts.map((c) => c.split(";")[0].trim()).join("; ");
      cookieStr = cookieStr ? `${cookieStr}; ${newPart}` : newPart;
      session.defaults.headers.common["Cookie"] = cookieStr;
    }
  }

  try {
    const r1 = await session.get("https://www.nseindia.com");
    applySetCookie(r1);
    await sleep(1000);
    const r2 = await session.get(
      "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    );
    applySetCookie(r2);
    await sleep(REQUEST_DELAY_MS);
  } catch (e) {
    console.warn("NSE session warm-up issue (may still work):", e.message);
  }

  session.defaults.validateStatus = undefined;
  const hasCookie = !!session.defaults.headers?.common?.Cookie;
  console.log(`[NSE] Session ready. Cookie present: ${hasCookie}`);
  return session;
}

async function downloadPdf(session, url, savePath) {
  ensureDirSync(path.dirname(savePath));
  try {
    const res = await session.get(url, { responseType: "arraybuffer" });
    if (res.status !== 200) {
      console.warn(`[NSE] PDF download HTTP ${res.status}: ${url.slice(0, 80)}...`);
      return false;
    }
    const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data);
    if (buf.length < 100 || buf[0] !== 0x25 || buf[1] !== 0x50) {
      console.warn(`[NSE] Response not a PDF (size=${buf.length}, magic=${buf.slice(0, 4).toString("ascii")}): ${url.slice(0, 60)}...`);
      return false;
    }
    fs.writeFileSync(savePath, buf);
    console.log(`[NSE] Saved: ${path.basename(savePath)}`);
    return true;
  } catch (err) {
    console.error(`[NSE] Failed to download PDF: ${err.message}. URL: ${url.slice(0, 80)}...`);
    return false;
  }
}

function updateMetaJson(folderPath, ann, filename, category) {
  const metaPath = path.join(folderPath, "meta.json");
  const existing = readJsonSync(metaPath, []);
  existing.push({
    filename: path.basename(filename),
    category,
    description: ann.desc ?? "",
    attachment_text: getAttachmentText(ann),
    announcement_date: ann.announcementDate ?? "",
    sort_date: ann.sort_date ?? "",
    seq_id: ann.seq_id ?? "",
    source_url: ann.attchmntFile ?? "",
    file_size: ann.attachmentSize ?? "",
  });
  writeJsonSync(metaPath, existing);
}

async function fetchAnnouncements(session, symbol, fromStr, toStr) {
  const params = new URLSearchParams({
    index: "equities",
    symbol,
    from_date: fromStr,
    to_date: toStr,
  });
  const url = `https://www.nseindia.com/api/corporate-announcements?${params.toString()}`;
  console.log(`[NSE] Fetching ${symbol} ${fromStr}..${toStr}: ${url}`);
  const res = await session.get(url);
  if (res.status !== 200) {
    console.error(`[NSE] API error: status=${res.status} ${res.statusText || ""}`);
    throw new Error(`NSE API returned ${res.status} ${res.statusText || ""}`);
  }
  if (!Array.isArray(res.data)) {
    console.warn(`[NSE] Response is not an array (type=${typeof res.data}). Raw: ${JSON.stringify(res.data)?.slice(0, 200)}`);
    return [];
  }
  const count = res.data.length;
  console.log(`[NSE] ${symbol} ${fromStr}..${toStr}: API returned ${count} raw announcement(s)`);
  if (count === 0) {
    console.warn(`[NSE] No announcements from NSE for ${symbol} in ${fromStr}–${toStr}. Symbol may be delisted, or no filings in this range.`);
  }
  return res.data;
}

async function processSymbol(session, symbol, fromStr, toStr, downloadLog, dataDir) {
  const baseDir = dataDir || DATA_DIR;
  console.log(
    `[NSE] Processing ${symbol} from ${fromStr} to ${toStr}...`,
  );
  let downloaded = 0;
  let anns;
  try {
    anns = await fetchAnnouncements(session, symbol, fromStr, toStr);
    // HBL is a special case: some historical announcements are filed under
    // HBLENGINE on NSE. If we get *no* announcements for HBL in this window,
    // try once more with HBLENGINE so we don't silently miss results.
    if ((!anns || anns.length === 0) && symbol === "HBL") {
      console.warn(
        `[NSE] ${symbol} returned 0 announcements. Retrying this window with HBLENGINE (alternate NSE symbol)`,
      );
      anns = await fetchAnnouncements(session, "HBLENGINE", fromStr, toStr);
    }
  } catch (err) {
    console.error(
      `[NSE] Error fetching announcements for ${symbol} (${fromStr}–${toStr}): ${err.message}`,
    );
    return 0;
  }

  let relevant = 0;
  let classified = 0;
  let allowed = 0;
  let skippedNoUrl = 0;
  let skippedInLog = 0;
  let skippedDupQuarter = 0;
  let attempted = 0;
  let recoveredFromMissing = 0;

  const seenQuarterCategory = new Set();

  for (const ann of anns) {
    if (!isRelevant(ann)) continue;
    relevant += 1;
    const category = classifyFiling(ann);
    if (!category) continue;
    classified += 1;
    if (!ALLOWED_CATEGORIES.has(category)) {
      continue; // concall_transcript etc. — we only want earnings_result, investor_presentation
    }
    allowed += 1;

    const pdfUrl = (ann.attchmntFile ?? "").trim();
    const seqId = ann.seq_id;
    if (!pdfUrl || !seqId) {
      skippedNoUrl += 1;
      continue;
    }

    if (downloadLog[seqId]) {
      const existingPath = downloadLog[seqId].filename;
      if (existingPath && fs.existsSync(existingPath)) {
        skippedInLog += 1;
        continue;
      }
      delete downloadLog[seqId];
      recoveredFromMissing += 1;
    }

    const sortDate = ann.sort_date || "";
    const quarter = inferQuarterForAnnouncement(ann);
    const key = `${quarter}|${category}`;
    if (seenQuarterCategory.has(key)) {
      skippedDupQuarter += 1;
      continue;
    }
    seenQuarterCategory.add(key);

    const datePart = sortDate ? sortDate.slice(0, 10) : "unknown";
    const filename = `${category}_${datePart}_${seqId}.pdf`;
    const folder = path.join(baseDir, symbol, quarter);
    const savePath = path.join(folder, filename);

    attempted += 1;
    const ok = await downloadPdf(session, pdfUrl, savePath);
    if (ok) {
      downloadLog[seqId] = {
        symbol,
        category,
        quarter,
        filename: savePath,
        url: pdfUrl,
        downloaded_at: new Date().toISOString(),
      };
      updateMetaJson(folder, ann, filename, category);
      downloaded += 1;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (recoveredFromMissing > 0) {
    console.log(`[NSE] ${symbol}: ${recoveredFromMissing} entry(ies) in log had missing file on disk; will re-download.`);
  }
  console.log(
    `[NSE] ${symbol} ${fromStr}..${toStr}: raw=${anns.length} relevant=${relevant} classified=${classified} allowed=${allowed} ` +
    `skipNoUrl=${skippedNoUrl} skipInLog=${skippedInLog} skipDupQ=${skippedDupQuarter} attempted=${attempted} downloaded=${downloaded}`,
  );
  if (anns.length > 0 && allowed === 0) {
    const sample = anns.find((a) => isRelevant(a));
    const cat = sample ? classifyFiling(sample) : "(none)";
    console.warn(
      `[NSE] ${symbol}: No announcements passed allowed categories (earnings_result, investor_presentation). ` +
      `Sample relevant announcement classified as: ${cat}. ` +
      `Check NSE listing or classification keywords.`,
    );
  }
  return downloaded;
}

async function runHistorical({ symbolFilter, historyWindow, dataDir }) {
  const baseDir = dataDir || DATA_DIR;
  const symbols = symbolFilter ? [symbolFilter.toUpperCase()] : WATCHLIST;
  const historyDays =
    HISTORY_WINDOWS[historyWindow] ?? DEFAULT_HISTORY_DAYS;

  const today = dayjs();
  const start = today.subtract(historyDays, "day");

  console.log("[NSE] " + "=".repeat(50));
  console.log(
    `[NSE] Historical mode: last ${historyDays} days (${start.format("DD-MM-YYYY")} -> ${today.format("DD-MM-YYYY")})`,
  );
  console.log(`[NSE] Data directory: ${baseDir}`);
  console.log(`[NSE] Symbols: ${symbols.join(", ")}`);

  const downloadLogPath = path.join(baseDir, "download_log.json");
  let downloadLog = {};
  if (fs.existsSync(downloadLogPath)) {
    try {
      downloadLog = readJsonSync(downloadLogPath, {});
      console.log(`[NSE] Loaded download_log.json: ${Object.keys(downloadLog).length} existing entry(ies)`);
    } catch (e) {
      console.warn(`[NSE] Could not read download_log.json: ${e.message}`);
    }
  } else {
    ensureDirSync(baseDir);
    console.log(`[NSE] No existing download_log.json; will create.`);
  }

  const session = await createNseSession();
  let totalNew = 0;

  for (const symbol of symbols) {
    let chunkStart = start;
    let chunks = 0;
    let symbolNew = 0;
    while (chunkStart.isBefore(today, "day")) {
      const tentativeEnd = chunkStart.add(89, "day");
      const chunkEnd = tentativeEnd.isAfter(today, "day") ? today : tentativeEnd;
      const fromStr = chunkStart.format("DD-MM-YYYY");
      const toStr = chunkEnd.format("DD-MM-YYYY");

      const newly = await processSymbol(
        session,
        symbol,
        fromStr,
        toStr,
        downloadLog,
        baseDir
      );
      symbolNew += newly;
      totalNew += newly;
      chunks += 1;
      writeJsonSync(downloadLogPath, downloadLog);

      chunkStart = chunkEnd.add(1, "day");
      await sleep(1000);
    }
    console.log(`[NSE] ${symbol}: ${chunks} chunk(s), ${symbolNew} new file(s) this run`);
    await sleep(1000);
  }

  console.log("[NSE] " + "=".repeat(50));
  console.log(
    `[NSE] Historical download complete. Total new files: ${totalNew}. Log: ${downloadLogPath}`,
  );
}

function parseArgs() {
  const args = process.argv.slice(2);
  let mode = "historical";
  let symbol = null;
  let historyWindow = "3q";

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--mode" && i + 1 < args.length) {
      mode = args[++i];
    } else if (a === "--symbol" && i + 1 < args.length) {
      symbol = args[++i];
    } else if (a === "--history-window" && i + 1 < args.length) {
      historyWindow = args[++i];
    }
  }
  return { mode, symbol, historyWindow };
}

export { runHistorical };

async function main() {
  const { mode, symbol, historyWindow } = parseArgs();
  ensureDirSync(DATA_DIR);
  console.log("NSE data directory:", DATA_DIR);

  if (mode === "historical") {
    await runHistorical({ symbolFilter: symbol, historyWindow });
  } else {
    console.error("Only historical mode is implemented for Node NSE downloader.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

