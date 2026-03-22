import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

export const SESSION_COOKIE_NAME = "mbiq_session";

/**
 * @param {import("express").Request} req
 * @returns {string | null}
 */
export function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const c = req.cookies?.[SESSION_COOKIE_NAME];
  if (c && typeof c === "string") return c.trim();
  return null;
}

/**
 * @param {string} token
 * @returns {{ sub: string; username: string }}
 */
export function verifyJwt(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (typeof payload !== "object" || payload === null) throw new Error("Invalid token");
  const sub = /** @type {{ sub?: string; username?: string }} */ (payload).sub;
  const username = /** @type {{ sub?: string; username?: string }} */ (payload).username;
  if (!sub || !username) throw new Error("Invalid token payload");
  return { sub, username };
}
