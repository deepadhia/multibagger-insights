/**
 * Normalize metric key lists from stock_tracking_profiles.config (and legacy shapes).
 */

export type TrackingProfileConfig = Record<string, unknown> | null | undefined;

/** Handle jsonb occasionally stringified or odd API shapes. */
export function parseTrackingProfileConfig(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (typeof p === "object" && p !== null && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

export function leadingIndicatorsFromProfile(profile: TrackingProfileConfig): string[] {
  if (!profile || typeof profile !== "object") return [];
  const p = profile as Record<string, unknown>;
  const raw = p.leading_indicators ?? p.leadingIndicators;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export function getPrimaryThesisMetric(
  profile: TrackingProfileConfig,
): { key: string; label: string } | null {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  const raw = p.primary_thesis_metric ?? p.primaryThesisMetric;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key : "";
  const label = typeof o.label === "string" ? o.label : "";
  if (!key && !label) return null;
  return { key: key || label, label: label || key };
}

export function getCoreThesisFromProfile(profile: TrackingProfileConfig): string {
  if (!profile || typeof profile !== "object") return "";
  const p = profile as Record<string, unknown>;
  const t = p.core_thesis ?? p.coreThesis;
  return typeof t === "string" ? t.trim() : "";
}

function readMetricKeysRaw(profile: Record<string, unknown>): unknown {
  if ("metric_keys" in profile) return profile.metric_keys;
  if ("metricKeys" in profile) return (profile as { metricKeys?: unknown }).metricKeys;
  if ("tracked_metrics" in profile) return profile.tracked_metrics;
  if ("trackedMetrics" in profile) return (profile as { trackedMetrics?: unknown }).trackedMetrics;
  // Some hand-written JSON uses "metrics" as a string[] of slugs
  if ("metrics" in profile) {
    const m = profile.metrics;
    if (Array.isArray(m) && m.every((x) => typeof x === "string")) return m;
  }
  return undefined;
}

function coerceStringArray(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) {
    return raw.filter((k): k is string => typeof k === "string");
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw.trim());
      if (Array.isArray(parsed)) {
        return parsed.filter((k): k is string => typeof k === "string");
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Returns metric_keys from profile config when present (any supported alias).
 * If the key is missing entirely, returns null so callers can fall back to `stocks.metric_keys`.
 * If the key is present as an empty array, returns [].
 */
export function metricKeysFromProfileConfig(profile: TrackingProfileConfig): string[] | null {
  if (!profile || typeof profile !== "object") return null;
  const raw = readMetricKeysRaw(profile as Record<string, unknown>);
  if (raw === undefined) return null;
  const coerced = coerceStringArray(raw);
  return coerced === null ? null : coerced;
}

const DEFAULT_METRIC_KEYS = ["revenue_growth", "opm", "pat_growth"];

/**
 * Full resolution: profile config → stocks.metric_keys column → defaults.
 */
export function getMetricKeysForPrompt(
  profile: TrackingProfileConfig,
  stockTableMetricKeys?: unknown,
  defaultKeys: string[] = DEFAULT_METRIC_KEYS,
): string[] {
  const fromProfile = metricKeysFromProfileConfig(profile);
  if (fromProfile !== null) return fromProfile;

  if (Array.isArray(stockTableMetricKeys)) {
    const fromStock = stockTableMetricKeys.filter((k): k is string => typeof k === "string");
    if (fromStock.length > 0) return fromStock;
  }

  return [...defaultKeys];
}
