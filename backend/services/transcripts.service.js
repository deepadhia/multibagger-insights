import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../../node_downloader/src/config.js";
import { runHistorical } from "../../node_downloader/src/nseDownloader.js";
import { runScreenerScraper } from "../../node_downloader/src/screenerScraper.js";
import { runMerge } from "../../node_downloader/src/mergeScreenerIntoNse.js";
import { verifyOutput } from "../../node_downloader/src/verifyDownloads.js";
import {
  getAllTickers,
  getTickersByIds,
  getWatchlistTickers,
} from "./stocks.service.js";

export async function downloadTranscriptsPipeline({
  window = "3q",
  symbols,
  stockIds,
  useWatchlist = true,
} = {}) {
  let tickers = [];

  if (Array.isArray(symbols) && symbols.length > 0) {
    tickers = [...new Set(symbols.map((s) => String(s).toUpperCase()))];
  } else if (Array.isArray(stockIds) && stockIds.length > 0) {
    tickers = await getTickersByIds(stockIds);
  } else if (useWatchlist) {
    tickers = await getWatchlistTickers();
  } else {
    tickers = await getAllTickers();
  }

  tickers = [...new Set(tickers)];

  if (tickers.length === 0) {
    const err = new Error("No symbols resolved from request");
    err.code = "NO_SYMBOLS";
    throw err;
  }

  // Step 1: NSE historical per symbol (sequential to avoid hammering NSE)
  for (const symbol of tickers) {
    await runHistorical({ symbolFilter: symbol, historyWindow: window });
  }

  // Step 2: Screener scrape for these symbols
  await runScreenerScraper(tickers);

  // Step 3: Merge Screener into NSE structure
  await runMerge({ window });

  // Step 4: Verify output
  const { ok, report } = verifyOutput();

  return { ok, window, symbols: tickers, report };
}

export function listDownloadedFilesForSymbol(symbol) {
  const normalized = String(symbol || "").toUpperCase();
  const symbolDir = path.join(DATA_DIR, normalized);

  if (!fs.existsSync(symbolDir) || !fs.statSync(symbolDir).isDirectory()) {
    return { symbol: normalized, files: [] };
  }

  const files = [];

  for (const quarterName of fs.readdirSync(symbolDir)) {
    const quarterDir = path.join(symbolDir, quarterName);
    if (!fs.statSync(quarterDir).isDirectory()) continue;

    const entries = fs.readdirSync(quarterDir).filter((f) =>
      f.toLowerCase().endsWith(".pdf"),
    );

    for (const filename of entries) {
      files.push({
        symbol: normalized,
        quarter: quarterName,
        filename,
        url: `/files/${normalized}/${quarterName}/${filename}`,
      });
    }
  }

  files.sort((a, b) => a.quarter.localeCompare(b.quarter));

  return { symbol: normalized, files };
}

