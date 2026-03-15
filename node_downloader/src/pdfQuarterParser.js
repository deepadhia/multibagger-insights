/**
 * Extract fiscal quarter (FYxx-Qy) from PDF content by parsing text from the first pages.
 * Used to validate that a downloaded filing is for the expected quarter before keeping it.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const PDF_MAGIC = Buffer.from("%PDF", "ascii");

/**
 * Parse extracted text for explicit quarter mentions. Returns e.g. "FY26-Q2" or null.
 * Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar.
 */
function parseQuarterFromText(text) {
  if (!text || typeof text !== "string") return null;
  const combined = text.slice(0, 12000).replace(/\s+/g, " ");

  // Q2 FY26, Q1FY26
  const m1 = combined.match(/q([1-4])\s*fy\s*(\d{2}|\d{4})/i) || combined.match(/q([1-4])fy(\d{2}|\d{4})/i);
  if (m1) {
    const qNum = Number(m1[1]);
    const fy = m1[2].length === 2 ? m1[2] : String(m1[2]).slice(-2);
    if (qNum >= 1 && qNum <= 4) return `FY${fy}-Q${qNum}`;
  }

  // Quarter 3 FY2026
  const m2 = combined.match(/quarter\s*([1-4])\s*(?:of\s*)?fy\s*(\d{2}|\d{4})/i);
  if (m2) {
    const qNum = Number(m2[1]);
    const fy = m2[2].length === 2 ? m2[2] : String(m2[2]).slice(-2);
    if (qNum >= 1 && qNum <= 4) return `FY${fy}-Q${qNum}`;
  }

  // Quarter ended 30 June 2025 / quarter ended June 30, 2025
  const qEnded = combined.match(/quarter\s+ended\s+(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:,\s*)?(\d{4})/i);
  if (qEnded) {
    const monthStr = (qEnded[2] || "").toLowerCase();
    const year = Number(qEnded[3]);
    const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const month = monthMap[monthStr];
    if (month && year) {
      const fyYear = month >= 4 ? year + 1 : year;
      const q = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 && month <= 12 ? 3 : 4;
      return `FY${String(fyYear).slice(-2)}-Q${q}`;
    }
  }

  // First / second / third / fourth quarter FY26
  const m3 = combined.match(/(?:first|1st|second|2nd|third|3rd|fourth|4th)\s+quarter\s+(?:of\s*)?fy\s*(\d{2}|\d{4})/i);
  if (m3) {
    const fy = m3[1].length === 2 ? m3[1] : String(m3[1]).slice(-2);
    const lower = combined.slice(0, 200).toLowerCase();
    if (lower.includes("first") || lower.includes("1st")) return `FY${fy}-Q1`;
    if (lower.includes("second") || lower.includes("2nd")) return `FY${fy}-Q2`;
    if (lower.includes("third") || lower.includes("3rd")) return `FY${fy}-Q3`;
    if (lower.includes("fourth") || lower.includes("4th")) return `FY${fy}-Q4`;
  }

  return null;
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
