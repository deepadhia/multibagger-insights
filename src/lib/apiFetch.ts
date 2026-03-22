/**
 * Same-origin API calls with session cookie (httpOnly JWT from POST /api/auth/login).
 * Use for all `/api/*` requests so the backend can authenticate the user.
 */
const API_BASE = (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? "";

export function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

export async function apiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? apiUrl(input) : input;
  return fetch(url, {
    ...init,
    credentials: "include",
  });
}
