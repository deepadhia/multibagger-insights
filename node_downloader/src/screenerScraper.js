import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import { DATA_DIR, WATCHLIST } from "./config.js";
import { ensureDirSync, writeJsonSync } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Node-specific Screener links file at project root
const OUTPUT_PATH = path.resolve(__dirname, "..", "..", "screener_links_node.json");

// Expect SCREENER_COOKIE env var like: "sessionid=...."
const SCREENER_COOKIE = process.env.SCREENER_COOKIE || "";

function buildClient() {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (SCREENER_COOKIE) {
    headers.Cookie = SCREENER_COOKIE;
  }
  return axios.create({
    headers,
    timeout: 20000,
  });
}

function extractLinks(symbol, companyUrl, html) {
  const $ = cheerio.load(html);
  const links = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    const lower = text.toLowerCase();

    if (!href || !lower) return;

    const parent = $(el).closest("tr,div,li");
    const parentText = parent.length ? parent.text().trim() : "";
    const isTranscript =
      lower.includes("transcript") || lower.includes("concall") ||
      (parentText && (parentText.toLowerCase().includes("transcript") || parentText.toLowerCase().includes("concall")));
    const isPpt = lower.includes("ppt") || lower.includes("presentation");
    // Earnings = quarterly results PDF from NSE/BSE/Announcements. NOT "REC" (REC = concall recording in Concalls section).
    const isResult =
      (lower.includes("result") || lower.includes("financial") || lower.includes("quarterly")) &&
      !lower.includes("earnings call"); // avoid concall/transcript links

    if (!(isTranscript || isPpt || isResult)) return;

    let label = parentText || text;

    // REC and Transcript row: same row has "Transcript" so both get concall. Earnings come from NSE/BSE/announcements section only.
    let section = "other";
    if (isTranscript) section = "concall";
    else if (isPpt) section = "presentation";
    else if (isResult) section = "earnings";

    const absoluteHref = href.startsWith("http")
      ? href
      : new URL(href, companyUrl).toString();

    // Earnings: only real results PDFs; exclude Screener nav, annual reports, newspaper notices
    if (section === "earnings") {
      if (absoluteHref.includes("screener.in/screen") || absoluteHref.includes("screen/new")) return;
      if (/create a stock screen|run queries on 10 years/i.test(text) || /create a stock screen|run queries on 10 years/i.test(label)) return;
      if (/financial year\s*20\d{2}\s*(from bse|from nse)?/i.test(label) || /financial year\s*20\d{2}\s*(from bse|from nse)?/i.test(text)) return;
      if (/newspaper\s*(publication|advertisement|ad\b)/i.test(label) || /newspaper\s*(publication|advertisement|ad\b)/i.test(text)) return;
    }

    links.push({
      symbol,
      company_url: companyUrl,
      section,
      label,
      href: absoluteHref,
      link_text: text,
    });
  });

  return links;
}

/**
 * @param {string} ticker - Symbol to use in output links and folder (e.g. HBL).
 * @param {string} [screenerSlug] - Slug for Screener URL; if omitted, uses ticker (e.g. HBLENGINE for HBL).
 */
async function scrapeForSymbol(client, ticker, screenerSlug = null) {
  const slug = (screenerSlug || ticker).trim();
  const companyUrl = `https://www.screener.in/company/${encodeURIComponent(slug)}/consolidated/`;
  console.log(`Scraping Screener for ${ticker}: ${companyUrl}`);
  try {
    const res = await client.get(companyUrl);
    const html = res.data;
    return extractLinks(ticker, companyUrl, html);
  } catch (err) {
    console.error(`Failed to scrape ${companyUrl}: ${err.message}`);
    return [];
  }
}

/**
 * @param {string[]} symbols - List of tickers (used for folder names and link symbol).
 * @param {Map<string, string>} [screenerSlugByTicker] - Optional map ticker -> Screener slug (e.g. HBL -> HBLENGINE).
 */
export async function runScreenerScraper(symbols = WATCHLIST, screenerSlugByTicker = null) {
  const client = buildClient();
  const allLinks = [];
  const list = Array.isArray(symbols) && symbols.length > 0 ? symbols : WATCHLIST;
  const slugMap = screenerSlugByTicker instanceof Map ? screenerSlugByTicker : null;

  for (const ticker of list) {
    const slug = slugMap && slugMap.has(ticker) ? slugMap.get(ticker) : ticker;
    const links = await scrapeForSymbol(client, ticker, slug);
    allLinks.push(...links);
  }

  ensureDirSync(path.dirname(OUTPUT_PATH));
  writeJsonSync(OUTPUT_PATH, allLinks);
  console.log(
    `Screener scrape complete (Node). Total links: ${allLinks.length}. Saved to ${OUTPUT_PATH}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/")) {
  runScreenerScraper().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

