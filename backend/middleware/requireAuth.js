import { extractToken, verifyJwt } from "../lib/authToken.js";

/**
 * Require valid JWT (Bearer or session cookie).
 * @type {import("express").RequestHandler}
 */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  try {
    const { sub, username } = verifyJwt(token);
    req.admin = { id: sub, username };
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired session" });
  }
}
