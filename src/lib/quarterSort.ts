/**
 * Sort quarterly snapshot rows by fiscal quarter (newest first), not by DB created_at.
 * Re-importing Q1 after Q3 must not make Q1 look like the "latest" quarter for signals/UI.
 */

export type QuarterSortable = {
  quarter?: string | null;
  created_at?: string | null;
};

/** Parse labels like Q3_FY26, Q1_FY2026, FY26-Q3 */
export function parseQuarterLabel(quarter: string | null | undefined): { fy: number; q: number } | null {
  if (!quarter || typeof quarter !== "string") return null;
  const s = quarter.trim();

  let m = s.match(/^Q(\d)_FY(\d{2}|\d{4})$/i);
  if (m) {
    let fy = parseInt(m[2], 10);
    if (m[2].length === 4) fy = fy % 100;
    const q = parseInt(m[1], 10);
    if (q >= 1 && q <= 4 && fy >= 0 && fy <= 99) return { fy, q };
  }

  m = s.match(/^FY(\d{2}|\d{4})-Q(\d)$/i);
  if (m) {
    let fy = parseInt(m[1], 10);
    if (m[1].length === 4) fy = fy % 100;
    const q = parseInt(m[2], 10);
    if (q >= 1 && q <= 4 && fy >= 0 && fy <= 99) return { fy, q };
  }

  return null;
}

/**
 * Sort comparator: newer quarter first (for .sort on an array).
 * Returns negative if a should come before b.
 */
export function compareQuarterLabelsDescending(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseQuarterLabel(a);
  const pb = parseQuarterLabel(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  if (pa.fy !== pb.fy) return pb.fy - pa.fy;
  return pb.q - pa.q;
}

/** Newest fiscal quarter first; tie-break by created_at (newer first). */
export function sortSnapshotsByQuarterDesc<T extends QuarterSortable>(rows: T[] | undefined | null): T[] {
  if (!rows?.length) return rows ? [...rows] : [];
  return [...rows].sort((a, b) => {
    const cmp = compareQuarterLabelsDescending(a.quarter, b.quarter);
    if (cmp !== 0) return cmp;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
}
