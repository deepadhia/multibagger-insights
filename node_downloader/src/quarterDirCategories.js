/**
 * Detect which filing categories already exist in a quarter folder.
 * NSE saves: SYMBOL_FY26-Q1_earnings_result_2025-08-11_SEQ.pdf
 * Screener saves: SYMBOL_FY26-Q1_earnings_result_2025-08-11_screener.pdf
 * Legacy: earnings_result_*.pdf
 */
import fs from "node:fs";

export const FILING_CATEGORIES = [
  "earnings_result",
  "investor_presentation",
  "concall_transcript",
];

/**
 * @param {string} quarterDir absolute path to e.g. data_node/TIMETECHNO/FY26-Q1
 * @param {unknown[]} metaArray parsed meta.json (array of { category?, filename? })
 * @returns {Set<string>}
 */
export function getCategoriesPresentInQuarterDir(quarterDir, metaArray = []) {
  const found = new Set();
  if (Array.isArray(metaArray)) {
    for (const m of metaArray) {
      if (m && typeof m.category === "string" && FILING_CATEGORIES.includes(m.category)) {
        found.add(m.category);
      }
    }
  }
  if (!quarterDir || !fs.existsSync(quarterDir)) return found;
  try {
    const st = fs.statSync(quarterDir);
    if (!st.isDirectory()) return found;
    for (const name of fs.readdirSync(quarterDir)) {
      if (!name.toLowerCase().endsWith(".pdf")) continue;
      const lower = name.toLowerCase();
      for (const cat of FILING_CATEGORIES) {
        if (lower.includes(`_${cat}_`) || name.startsWith(`${cat}_`)) {
          found.add(cat);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return found;
}

/** True if any PDF in this quarter folder already represents this category. */
export function quarterDirHasCategory(quarterDir, category) {
  if (!FILING_CATEGORIES.includes(category)) return false;
  return getCategoriesPresentInQuarterDir(quarterDir, []).has(category);
}
