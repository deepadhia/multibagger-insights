/**
 * Extract fiscal quarter (FYxx-Qy) from PDF content by parsing text from the first pages.
 * Used to validate that a downloaded filing is for the expected quarter before keeping it.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const PDF_MAGIC = Buffer.from("%PDF", "ascii");

/**
 * Normalize 2-digit FY from regex capture (handles 4-digit calendar-style typos).
 */
function fyToYY(fyRaw) {
  if (!fyRaw) return null;
  const s = String(fyRaw).trim();
  if (s.length === 4 && /^\d{4}$/.test(s)) return s.slice(-2);
  if (s.length === 2 && /^\d{2}$/.test(s)) return s;
  return null;
}

function addQuarterCandidate(set, fyRaw, qNum) {
  const fy = fyToYY(fyRaw);
  const q = Number(qNum);
  if (!fy || q < 1 || q > 4) return;
  const y = Number(fy);
  // Ignore ancient labels (comparatives from 2000s PDFs) and obvious garbage
  if (y < 15 || y > 45) return;
  set.add(`FY${fy}-Q${q}`);
}

/**
 * When multiple Qn FYxx appear (e.g. FY20 comparatives vs FY26 headline), pick the latest FY
 * so we don't discard the correct transcript.
 */
function pickLatestQuarterCandidate(candidates) {
  if (!candidates || candidates.size === 0) return null;
  const scored = [...candidates].map((label) => {
    const m = label.match(/^FY(\d+)-Q([1-4])$/);
    if (!m) return null;
    return { label, fy: Number(m[1]), q: Number(m[2]) };
  }).filter(Boolean);
  scored.sort((a, b) => b.fy - a.fy || b.q - a.q);
  return scored[0].label;
}

/**
 * Parse extracted text for explicit quarter mentions. Returns e.g. "FY26-Q2" or null.
 * Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar.
 */
function parseQuarterFromText(text) {
  if (!text || typeof text !== "string") return null;
  const combined = text.slice(0, 15000).replace(/\s+/g, " ");
  const candidates = new Set();

  let m;
  const reQfy = /q([1-4])\s*fy\s*(\d{2}|\d{4})/gi;
  while ((m = reQfy.exec(combined)) !== null) {
    addQuarterCandidate(candidates, m[2], m[1]);
  }
  const reQfyTight = /q([1-4])fy(\d{2}|\d{4})/gi;
  while ((m = reQfyTight.exec(combined)) !== null) {
    addQuarterCandidate(candidates, m[2], m[1]);
  }

  const reQuarterOf = /quarter\s*([1-4])\s*(?:of\s*)?fy\s*(\d{2}|\d{4})/gi;
  while ((m = reQuarterOf.exec(combined)) !== null) {
    addQuarterCandidate(candidates, m[2], m[1]);
  }

  // Quarter ended 30 June 2025 — collect all; prefer latest FY via pickLatestQuarterCandidate
  const reEnded =
    /quarter\s+ended\s+(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:,\s*)?(\d{4})/gi;
  while ((m = reEnded.exec(combined)) !== null) {
    const monthStr = (m[2] || "").toLowerCase();
    const year = Number(m[3]);
    const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const month = monthMap[monthStr];
    if (month && year) {
      const fyYear = month >= 4 ? year + 1 : year;
      const q = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 && month <= 12 ? 3 : 4;
      addQuarterCandidate(candidates, String(fyYear).slice(-2), q);
    }
  }

  // Ordinal quarter + FY (scan a wider window than first 200 chars)
  const reOrdinal = /(first|1st|second|2nd|third|3rd|fourth|4th)\s+quarter\s+(?:of\s*)?fy\s*(\d{2}|\d{4})/gi;
  while ((m = reOrdinal.exec(combined)) !== null) {
    const ord = (m[1] || "").toLowerCase();
    const q =
      ord.includes("first") || ord.startsWith("1")
        ? 1
        : ord.includes("second") || ord.startsWith("2")
          ? 2
          : ord.includes("third") || ord.startsWith("3")
            ? 3
            : ord.includes("fourth") || ord.startsWith("4")
              ? 4
              : 0;
    if (q) addQuarterCandidate(candidates, m[2], q);
  }

  return pickLatestQuarterCandidate(candidates);
}

/**
 * Read a PDF file and extract fiscal quarter from its text (first few pages).
 * @param {string} filePath - Full path to the PDF file
 * @returns {Promise<string|null>} e.g. "FY26-Q2" or null if not detected / parse error
 */
export async function extractQuarterFromPdf(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  if (buf.length < 100 || !buf.slice(0, 4).equals(PDF_MAGIC)) return null;
  let parser;
  try {
    parser = new PDFParse({ data: buf });
    const result = await parser.getText({ partial: [1, 2, 3] }); // first 3 pages only
    const text = result?.text;
    return parseQuarterFromText(text);
  } catch (_) {
    return null;
  } finally {
    try {
      if (parser && typeof parser.destroy === "function") parser.destroy();
    } catch (_) {}
  }
}
