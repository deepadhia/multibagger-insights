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

  const positiveKeywords = [
    "concall",
    "con call",
    "con. call",
    "conference call",
    "earnings call",
    "transcript",
    "financial results",
    "financial result",
    "quarterly results",
    "quarterly result",
    "annual results",
    "annual result",
    "investor presentation",
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

function inferQuarter(sortDate) {
  if (!sortDate) return "UNKNOWN";
  const d = dayjs(sortDate);
  const year = d.year();
  const month = d.month() + 1; // 1–12

  let fyYear = year + (month >= 4 ? 1 : 0);
  let q;
  if (month >= 4 && month <= 6) q = 1;
  else if (month >= 7 && month <= 9) q = 2;
  else if (month >= 10 && month <= 12) q = 3;
  else q = 4;

  return `FY${String(fyYear).slice(-2)}-Q${q}`;
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
  return session;
}

async function downloadPdf(session, url, savePath) {
  ensureDirSync(path.dirname(savePath));
  try {
    const res = await session.get(url, { responseType: "arraybuffer" });
    fs.writeFileSync(savePath, res.data);
    console.log(`Saved: ${savePath}`);
    return true;
  } catch (err) {
    console.error(`Failed to download ${url}: ${err.message}`);
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
  const res = await session.get(url);
  if (res.status !== 200) {
    throw new Error(`NSE API returned ${res.status} ${res.statusText || ""}`);
  }
  if (!Array.isArray(res.data)) {
    return [];
  }
  return res.data;
}

async function processSymbol(session, symbol, fromStr, toStr, downloadLog) {
  console.log(
    `Processing ${symbol} from ${fromStr} to ${toStr} (NSE corporate announcements)...`,
  );
  let downloaded = 0;
  let anns;
  try {
    anns = await fetchAnnouncements(session, symbol, fromStr, toStr);
  } catch (err) {
    console.error(
      `Error fetching announcements for ${symbol} (${fromStr}–${toStr}): ${err.message}`,
    );
    return 0;
  }

  const seenQuarterCategory = new Set();

  for (const ann of anns) {
    if (!isRelevant(ann)) continue;
    const category = classifyFiling(ann);
    if (!category || !ALLOWED_CATEGORIES.has(category)) continue;

    const pdfUrl = (ann.attchmntFile ?? "").trim();
    const seqId = ann.seq_id;
    if (!pdfUrl || !seqId) continue;

    if (downloadLog[seqId]) {
      continue;
    }

    const sortDate = ann.sort_date || "";
    const quarter = inferQuarter(sortDate);
    const key = `${quarter}|${category}`;
    if (seenQuarterCategory.has(key)) {
      continue;
    }
    seenQuarterCategory.add(key);

    const datePart = sortDate ? sortDate.slice(0, 10) : "unknown";
    const filename = `${category}_${datePart}_${seqId}.pdf`;
    const folder = path.join(DATA_DIR, symbol, quarter);
    const savePath = path.join(folder, filename);

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

  return downloaded;
}

async function runHistorical({ symbolFilter, historyWindow }) {
  const symbols = symbolFilter ? [symbolFilter.toUpperCase()] : WATCHLIST;
  const historyDays =
    HISTORY_WINDOWS[historyWindow] ?? DEFAULT_HISTORY_DAYS;

  const today = dayjs();
  const start = today.subtract(historyDays, "day");

  console.log(
    `Historical mode (last ${historyDays} days): ${start.format(
      "DD-MM-YYYY",
    )} -> ${today.format("DD-MM-YYYY")}`,
  );
  console.log(`Symbols: ${symbols.join(", ")}`);

  const downloadLogPath = path.join(DATA_DIR, "download_log.json");
  const downloadLog = readJsonSync(downloadLogPath, {});
  const session = await createNseSession();
  let totalNew = 0;

  for (const symbol of symbols) {
    let chunkStart = start;
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
      );
      totalNew += newly;
      writeJsonSync(downloadLogPath, downloadLog);

      chunkStart = chunkEnd.add(1, "day");
      await sleep(1000);
    }
    await sleep(1000);
  }

  console.log("=".repeat(50));
  console.log(
    `Historical download complete (Node). Total new files: ${totalNew}`,
  );
  console.log(`Log saved to: ${downloadLogPath}`);
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

