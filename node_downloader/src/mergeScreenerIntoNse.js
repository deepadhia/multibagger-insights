/**
 * Merge Screener into NSE download structure — same flow as Python merge_screener_into_nse.py:
 * 1. Earnings + Investor presentation: from NSE first; if missing for a quarter, backfill from Screener (same fiscal quarter).
 * 2. Concall transcript: from Screener only.
 */
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import dayjs from "dayjs";
import https from "node:https";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { DATA_DIR } from "./config.js";
import { ensureDirSync, readJsonSync, writeJsonSync, sleep } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Node-specific Screener links file so we don't overwrite Python's
const SCREENER_LINKS_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "screener_links_node.json",
);

const ALLOWED_CATEGORIES = new Set([
  "concall_transcript",
  "earnings_result",
  "investor_presentation",
]);

const DOWNLOAD_DELAY_MS = 1000;

// Map history window to max quarters to backfill, roughly matching Python:
// 6m ≈ 2 quarters, 1y ≈ 4, 2y ≈ 8, 3q = 3.
const WINDOW_TO_QUARTERS = {
  "6m": 2,
  "1y": 4,
  "2y": 8,
  "3q": 3,
};

function parseLabelDate(labelOrLink) {
  const text =
    typeof labelOrLink === "string"
      ? labelOrLink
      : [labelOrLink?.label, labelOrLink?.link_text]
          .filter(Boolean)
          .join(" ");
  if (!text) return null;
  const m = text.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i,
  );
  if (!m) return null;
  const monthStr = m[1].toLowerCase();
  const year = Number(m[2]);
  const monthMap = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const month = monthMap[monthStr];
  if (!month) return null;
  return dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
}

function fiscalQuarterFromDate(d) {
  const year = d.year();
  const month = d.month() + 1;
  const fyYear = month >= 4 ? year + 1 : year;
  let q;
  if (month >= 4 && month <= 6) q = 1;
  else if (month >= 7 && month <= 9) q = 2;
  else if (month >= 10 && month <= 12) q = 3;
  else q = 4;
  return `FY${String(fyYear).slice(-2)}-Q${q}`;
}

function mapLinkToQuarter(link) {
  const d = parseLabelDate(link);
  if (!d) return null;
  return fiscalQuarterFromDate(d);
}

function groupLinksBySymbolQuarter(links) {
  const bySymbolQuarter = new Map();
  for (const link of links) {
    const quarter = mapLinkToQuarter(link);
    if (!quarter) continue;
    const key = `${link.symbol}|${quarter}`;
    if (!bySymbolQuarter.has(key)) {
      bySymbolQuarter.set(key, []);
    }
    bySymbolQuarter.get(key).push({ ...link, fiscal_quarter: quarter });
  }
  return bySymbolQuarter;
}

function buildHttpClient(referrer) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/122.0.0.0 Safari/537.36",
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
  };
  if (referrer) {
    headers.Referer = referrer;
  }
  return axios.create({
    headers,
    timeout: 25000,
    maxRedirects: 5,
  });
}

// Very low-level fallback for broken BSE responses that Node's HTTP parser rejects.
// Opens a raw TLS socket, sends a manual HTTP GET, and extracts the body bytes.
async function downloadViaRawTls(url, referer, savePath) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : 443;
  const pathWithQuery = parsed.pathname + (parsed.search || "");

  const headers = [
    `GET ${pathWithQuery} HTTP/1.1`,
    `Host: ${host}`,
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/122.0.0.0 Safari/537.36",
    "Accept: application/pdf,application/octet-stream,*/*",
    "Connection: close",
  ];
  if (referer) {
    headers.push(`Referer: ${referer}`);
  }
  const requestText = headers.join("\r\n") + "\r\n\r\n";

  const bodyBuffer = await new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false, // we already handle security at higher level
      },
      () => {
        socket.write(requestText);
      },
    );

    const chunks = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", (err) => reject(err));
    socket.on("end", () => {
      const buf = Buffer.concat(chunks);
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return reject(new Error("No header/body separator in raw response"));
      }
      const headerPart = buf.slice(0, headerEnd).toString("latin1");
      let bodyPart = buf.slice(headerEnd + 4);

      // Handle simple chunked transfer-encoding if present
      const lowerHeaders = headerPart.toLowerCase();
      if (lowerHeaders.includes("transfer-encoding: chunked")) {
        try {
          const out = [];
          let i = 0;
          while (i < bodyPart.length) {
            const lineEnd = bodyPart.indexOf("\r\n", i);
            if (lineEnd === -1) break;
            const sizeHex = bodyPart
              .slice(i, lineEnd)
              .toString("ascii")
              .trim();
            const size = parseInt(sizeHex, 16);
            if (!Number.isFinite(size)) break;
            if (size === 0) {
              break;
            }
            const chunkStart = lineEnd + 2;
            const chunkEnd = chunkStart + size;
            out.push(bodyPart.slice(chunkStart, chunkEnd));
            i = chunkEnd + 2; // skip trailing CRLF
          }
          bodyPart = Buffer.concat(out);
        } catch {
          // If de-chunking fails, fall back to raw bodyPart
        }
      }

      resolve(bodyPart);
    });
  });

  fs.writeFileSync(savePath, bodyBuffer);
  console.log(`Saved via raw TLS: ${savePath}`);
  return savePath;
}

async function downloadFile(link, folderPath, category) {
  ensureDirSync(folderPath);
  const quarter = link.fiscal_quarter;
  const baseName = `${category}_${quarter}_${dayjs().format("YYYY-MM-DD")}_screener.pdf`;
  const savePath = path.join(folderPath, baseName);

  const isBse = link.href.includes("bseindia.com");
  const client = buildHttpClient(isBse ? link.company_url : undefined);

  let lastError = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let res;
      try {
        res = await client.get(link.href, { responseType: "arraybuffer" });
      } catch (err) {
        // Rough SSL fallback like Python download_file
        if (err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
          console.warn(
            `SSL verify failed for ${link.href.slice(
              0,
              80,
            )}, retrying with insecure TLS...`,
          );
          const insecureClient = axios.create({
            ...client.defaults,
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
          });
          res = await insecureClient.get(link.href, {
            responseType: "arraybuffer",
          });
        } else if (
          typeof err.message === "string" &&
          err.message.includes("Parse Error")
        ) {
          // Node HTTP parser rejected the response (e.g. whitespace in headers).
          // Fall back to raw TLS and manual parsing.
          if (isBse) {
            return await downloadViaRawTls(
              link.href,
              link.company_url,
              savePath,
            );
          }
          throw err;
        } else {
          throw err;
        }
      }

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }

      fs.writeFileSync(savePath, res.data);
      console.log(`Saved: ${savePath}`);
      return savePath;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(DOWNLOAD_DELAY_MS * 2);
      }
    }
  }

  console.error(
    `Failed to download ${link.href.slice(
      0,
      80,
    )}: ${lastError && lastError.message ? lastError.message : lastError}`,
  );
  return null;
}

async function backfillQuarterForSymbol(symbol, quarter, links) {
  const folder = path.join(DATA_DIR, symbol, quarter);
  ensureDirSync(folder);

  const metaPath = path.join(folder, "meta.json");
  const meta = readJsonSync(metaPath, []);
  const existingCats = new Set(meta.map((m) => m.category));

  const hasEarnings = existingCats.has("earnings_result");
  const hasPpt = existingCats.has("investor_presentation");
  const hasConcall = existingCats.has("concall_transcript");

  for (const link of links) {
    if (link.section === "earnings" && !hasEarnings) {
      const savePath = await downloadFile(link, folder, "earnings_result");
      if (savePath) {
        meta.push({
          filename: path.basename(savePath),
          category: "earnings_result",
          description: link.link_text,
          attachment_text: link.label,
          announcement_date: "",
          sort_date: "",
          seq_id: "",
          source_url: link.href,
          file_size: "",
        });
      }
    } else if (link.section === "presentation" && !hasPpt) {
      const savePath = await downloadFile(
        link,
        folder,
        "investor_presentation",
      );
      if (savePath) {
        meta.push({
          filename: path.basename(savePath),
          category: "investor_presentation",
          description: link.link_text,
          attachment_text: link.label,
          announcement_date: "",
          sort_date: "",
          seq_id: "",
          source_url: link.href,
          file_size: "",
        });
      }
    } else if (link.section === "concall" && !hasConcall) {
      const savePath = await downloadFile(
        link,
        folder,
        "concall_transcript",
      );
      if (savePath) {
        meta.push({
          filename: path.basename(savePath),
          category: "concall_transcript",
          description: link.link_text,
          attachment_text: link.label,
          announcement_date: "",
          sort_date: "",
          seq_id: "",
          source_url: link.href,
          file_size: "",
        });
      }
    }

    await sleep(DOWNLOAD_DELAY_MS);
  }

  writeJsonSync(metaPath, meta);
}

export async function runMerge({ window = "3q" } = {}) {
  if (!fs.existsSync(SCREENER_LINKS_PATH)) {
    throw new Error(
      `Missing ${SCREENER_LINKS_PATH}. Run Screener scraper first.`,
    );
  }

  const links = readJsonSync(SCREENER_LINKS_PATH, []);
  const bySymbolQuarter = groupLinksBySymbolQuarter(links);

  // Limit how many quarters we touch per symbol based on the window flag.
  const maxQuarters = WINDOW_TO_QUARTERS[window] ?? WINDOW_TO_QUARTERS["3q"];
  const allowedBySymbol = new Map();
  for (const key of bySymbolQuarter.keys()) {
    const [symbol, quarter] = key.split("|");
    if (!allowedBySymbol.has(symbol)) {
      allowedBySymbol.set(symbol, []);
    }
    allowedBySymbol.get(symbol).push(quarter);
  }
  for (const [symbol, quarters] of allowedBySymbol.entries()) {
    quarters.sort(); // FYxx-Qy sorts lexicographically fine within small ranges
    const keep = new Set(quarters.slice(-maxQuarters));
    allowedBySymbol.set(symbol, keep);
  }

  // Further restrict: only process quarters that already exist from NSE for that symbol,
  // so Node does not create extra historical quarters that Python never had.
  const existingBySymbol = new Map();
  if (fs.existsSync(DATA_DIR)) {
    for (const symbolName of fs.readdirSync(DATA_DIR)) {
      const symbolDir = path.join(DATA_DIR, symbolName);
      if (!fs.statSync(symbolDir).isDirectory()) continue;
      const quarters = new Set();
      for (const q of fs.readdirSync(symbolDir)) {
        const qDir = path.join(symbolDir, q);
        if (!fs.statSync(qDir).isDirectory()) continue;
        if (!q.startsWith("FY")) continue;
        quarters.add(q);
      }
      if (quarters.size > 0) {
        existingBySymbol.set(symbolName, quarters);
      }
    }
  }

  console.log("Merge data directory:", DATA_DIR);
  console.log(
    `Merge: ${links.length} Screener links -> ${bySymbolQuarter.size} symbol-quarter groups (max ${maxQuarters} quarter(s) per symbol)`,
  );
  if (bySymbolQuarter.size === 0 && links.length > 0) {
    console.warn(
      "No links had a parseable quarter label (e.g. 'Sep 2025'). Check screener_links_node.json labels.",
    );
  }

  for (const [key, linksForKey] of bySymbolQuarter.entries()) {
    const [symbol, quarter] = key.split("|");
    const allowedSet = allowedBySymbol.get(symbol);
    const existingSet = existingBySymbol.get(symbol);
    if (allowedSet && !allowedSet.has(quarter)) {
      continue;
    }
    if (existingSet && !existingSet.has(quarter)) {
      // Quarter not present from NSE for this symbol; skip to match Python behaviour.
      continue;
    }
    console.log(`Merging Screener for ${symbol} ${quarter}...`);
    await backfillQuarterForSymbol(symbol, quarter, linksForKey);
  }

  console.log("Merge complete (Node).");
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/")) {
  runMerge().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

