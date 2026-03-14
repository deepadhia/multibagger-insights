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

    const isTranscript =
      lower.includes("transcript") || lower.includes("concall");
    const isPpt = lower.includes("ppt") || lower.includes("presentation");
    const isResult =
      lower.includes("result") || lower.includes("financial") || lower.includes("quarterly");

    if (!(isTranscript || isPpt || isResult)) return;

    // Try to find a nearby label (e.g. "Sep 2025")
    let label = "";
    const parentText = $(el).closest("tr,div,li").text();
    if (parentText) {
      label = parentText.trim();
    } else {
      label = text;
    }

    let section = "other";
    if (isTranscript) section = "concall";
    else if (isPpt) section = "presentation";
    else if (isResult) section = "earnings"; // same as Python: earnings_result backfill

    const absoluteHref = href.startsWith("http")
      ? href
      : new URL(href, companyUrl).toString();

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

async function scrapeForSymbol(client, symbol) {
  const companyUrl = `https://www.screener.in/company/${symbol}/consolidated/`;
  console.log(`Scraping Screener for ${symbol}: ${companyUrl}`);
  try {
    const res = await client.get(companyUrl);
    const html = res.data;
    return extractLinks(symbol, companyUrl, html);
  } catch (err) {
    console.error(`Failed to scrape ${companyUrl}: ${err.message}`);
    return [];
  }
}

export async function runScreenerScraper(symbols = WATCHLIST) {
  const client = buildClient();
  const allLinks = [];

  for (const symbol of symbols) {
    const links = await scrapeForSymbol(client, symbol);
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

