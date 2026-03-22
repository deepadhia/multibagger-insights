/**
 * Turn snake_case tracking slugs into readable labels; keep known finance acronyms crisp.
 */
const KNOWN: Record<string, string> = {
  opm: "OPM",
  pat: "PAT",
  pat_growth: "PAT growth",
  revenue_growth: "Revenue growth",
  ebitda: "EBITDA",
  ebitda_margin: "EBITDA margin",
  roce: "ROCE",
  roe: "ROE",
  fcf: "Free cash flow",
  free_cash_flow: "Free cash flow",
  capex: "Capex",
  eps: "EPS",
  pbt: "PBT",
  yoy: "YoY",
  qoq: "QoQ",
  b2c: "B2C",
  b2b: "B2B",
};

const SHORT_ACRONYMS = new Set(["opm", "pat", "pbt", "eps", "fcf", "roe", "roce", "ebitda", "capex", "yoy", "qoq", "b2c", "b2b"]);

export function humanizeTrackingKey(slug: string): string {
  const k = slug.trim();
  if (!k) return "";
  const lower = k.toLowerCase();
  if (KNOWN[lower]) return KNOWN[lower];
  if (KNOWN[k]) return KNOWN[k];

  return k
    .split("_")
    .filter(Boolean)
    .map((word) => {
      const w = word.toLowerCase();
      if (SHORT_ACRONYMS.has(w)) return w.toUpperCase();
      if (w.length <= 2 && /^[a-z]{1,2}$/.test(w)) return w.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
