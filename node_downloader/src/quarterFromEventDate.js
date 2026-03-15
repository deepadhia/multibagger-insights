/**
 * Single source of truth: map an *event date* (call date, result announcement date)
 * to the *results quarter* that the document is about. Indian FY (Apr–Mar).
 *
 * Rule: Results are announced ~1 month after quarter end.
 *   Jan (release) → Q3 (Oct–Dec)   Apr → Q4 (Jan–Mar)   Jul → Q1 (Apr–Jun)   Oct → Q2 (Jul–Sep)
 *
 * Use this for: NSE announcement date fallback, Screener label date, any "when was this published" date.
 * Do NOT use calendar quarter of the date (that would put Jan in Q4).
 */
import dayjs from "dayjs";

/**
 * @param {string|Date|dayjs.Dayjs} dateInput - Event date (e.g. announcement date, call date)
 * @returns {string} e.g. "FY26-Q3"
 */
export function eventDateToResultsQuarter(dateInput) {
  if (dateInput == null) return "UNKNOWN";
  const d = dayjs(dateInput);
  if (!d.isValid()) return "UNKNOWN";
  const year = d.year();
  const month = d.month() + 1; // 1–12
  let q;
  let fyYear;
  if (month >= 1 && month <= 3) {
    q = 3; fyYear = year; // Jan–Mar → Q3 (Oct–Dec) results
  } else if (month >= 4 && month <= 6) {
    q = 4; fyYear = year; // Apr–Jun → Q4 (Jan–Mar) results
  } else if (month >= 7 && month <= 9) {
    q = 1; fyYear = year + 1; // Jul–Sep → Q1 (Apr–Jun) results
  } else {
    q = 2; fyYear = year + 1; // Oct–Dec → Q2 (Jul–Sep) results
  }
  return `FY${String(fyYear).slice(-2)}-Q${q}`;
}
