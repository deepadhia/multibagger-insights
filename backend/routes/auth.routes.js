import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

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
 * GET /api/auth/drive/start — redirect user to Google OAuth consent
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

const authRouter = express.Router();
authRouter.get("/api/auth/drive/start", driveStartHandler);
authRouter.get("/api/auth/drive/callback", driveCallbackHandler);

export default authRouter;
