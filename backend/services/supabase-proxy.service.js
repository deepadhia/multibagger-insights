import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/env.js";

/**
 * Call a Supabase Edge Function by name. Used to proxy fetch-price and fetch-financials
 * so the frontend can call our backend instead of Supabase directly.
 * @param {string} functionName - e.g. "fetch-price" or "fetch-financials"
 * @param {Record<string, unknown>} body - JSON body to send
 * @returns {Promise<{ ok: boolean; data?: unknown; error?: string; status: number }>}
 */
export async function invokeSupabaseFunction(functionName, body = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      status: 503,
      error: "Supabase URL or anon key not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_* equivalents) in backend env.",
    };
  }

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${functionName}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error || data?.message || `Request failed: ${res.status}`,
        data,
      };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
