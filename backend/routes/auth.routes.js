import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { JWT_SECRET } from "../config/env.js";
import { extractToken, SESSION_COOKIE_NAME, verifyJwt } from "../lib/authToken.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
const OAUTH_CLIENT_PATH = process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH
  ? path.isAbsolute(process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH)
    ? process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH
    : path.resolve(process.cwd(), process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH)
  : "";
const TOKENS_PATH = path.resolve(__dirname, "../secrets/drive-oauth-tokens.json");
const SCOPES = ["https://www.googleapis.com/auth/drive"];

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieSecure() {
  return process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1";
}

function getOAuthClientConfig() {
  if (!OAUTH_CLIENT_PATH || !fs.existsSync(OAUTH_CLIENT_PATH)) return null;
  const raw = fs.readFileSync(OAUTH_CLIENT_PATH, "utf8");
  const data = JSON.parse(raw);
  const client = data.web || data.installed;
  if (!client?.client_id || !client?.client_secret) return null;
  return {
    clientId: client.client_id,
    clientSecret: client.client_secret,
    redirectUri: `${BACKEND_URL}/api/auth/drive/callback`,
  };
}

/**
 * POST /api/auth/login
 */
export async function loginHandler(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Username and password required" });
  }
  const u = String(username).trim();
  try {
    const { rows } = await pool.query(
      "SELECT id, username, password_hash FROM app_admin_users WHERE username = $1",
      [u]
    );
    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }
    const user = rows[0];
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }
    const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    const secure = cookieSecure();
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });
    return res.json({ ok: true, user: { username: user.username } });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ ok: false, error: "Login failed" });
  }
}

/**
 * POST /api/auth/logout
 */
export function logoutHandler(_req, res) {
  const secure = cookieSecure();
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/", httpOnly: true, secure, sameSite: process.env.NODE_ENV === "production" ? "none" : "lax" });
  res.json({ ok: true });
}

/**
 * GET /api/auth/me — public; returns user if session valid
 */
export function meHandler(req, res) {
  const token = extractToken(req);
  if (!token) {
    return res.json({ user: null });
  }
  try {
    const { username } = verifyJwt(token);
    return res.json({ user: { username } });
  } catch {
    return res.json({ user: null });
  }
}

/**
 * GET /api/auth/drive/start — redirect user to Google OAuth consent (requires auth)
 */
export function driveStartHandler(_req, res) {
  const config = getOAuthClientConfig();
  if (!config) {
    return res.status(503).json({
      ok: false,
      error: "OAuth client not configured. Set GOOGLE_OAUTH_CLIENT_JSON_PATH to your client_secret_*.json path.",
    });
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.redirect(302, url);
}

/**
 * GET /api/auth/drive/callback — exchange code for tokens, store, redirect to app
 */
export async function driveCallbackHandler(req, res) {
  const { code, error } = req.query;
  if (error) {
    return res.redirect(`${FRONTEND_URL}/?drive_error=${encodeURIComponent(error)}`);
  }
  if (!code || typeof code !== "string") {
    return res.redirect(`${FRONTEND_URL}/?drive_error=missing_code`);
  }

  const config = getOAuthClientConfig();
  if (!config) {
    return res.redirect(`${FRONTEND_URL}/?drive_error=oauth_not_configured`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) {
      return res.redirect(`${FRONTEND_URL}/?drive_error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    const dir = path.dirname(TOKENS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      TOKENS_PATH,
      JSON.stringify(
        {
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
        },
        null,
        2
      ),
      "utf8"
    );

    res.redirect(302, `${FRONTEND_URL}/?drive_connected=1`);
  } catch (err) {
    console.error("drive callback error:", err);
    res.redirect(`${FRONTEND_URL}/?drive_error=exchange_failed`);
  }
}

