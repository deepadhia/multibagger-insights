import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { getDataDir } from "../config/dataDir.js";
import { logger } from "../utils/logger.js";

const LOG = "Drive";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const DELETE_LOCAL_AFTER_UPLOAD = process.env.DELETE_LOCAL_AFTER_DRIVE_UPLOAD !== "false";
const SA_JSON_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || "";
const SA_JSON_STRING = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
const OAUTH_CLIENT_PATH = process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH
  ? path.isAbsolute(process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH)
    ? process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH
    : path.resolve(process.cwd(), process.env.GOOGLE_OAUTH_CLIENT_JSON_PATH)
  : "";
const OAUTH_TOKENS_PATH = path.resolve(__dirname, "../secrets/drive-oauth-tokens.json");

const DRIVE_UPLOAD_FOLDER_NAME = "Announcements";

function getServiceAccountCredentials() {
  if (SA_JSON_PATH && fs.existsSync(SA_JSON_PATH)) {
    try {
      const raw = fs.readFileSync(SA_JSON_PATH, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      console.error("[Drive] Failed to parse service account JSON file at", SA_JSON_PATH, e.message);
      return null;
    }
  }
  if (SA_JSON_STRING) {
    try {
      return JSON.parse(SA_JSON_STRING);
    } catch (e) {
      console.error("[Drive] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Got:", SA_JSON_STRING.slice(0, 60), e.message);
      return null;
    }
  }
  return null;
}

function getOAuthClientConfig() {
  if (!OAUTH_CLIENT_PATH) { console.error("[Drive Debug] OAUTH_CLIENT_PATH is empty"); return null; }
  if (!fs.existsSync(OAUTH_CLIENT_PATH)) { console.error("[Drive Debug] client secret file NOT FOUND at:", OAUTH_CLIENT_PATH); return null; }
  try {
    const raw = fs.readFileSync(OAUTH_CLIENT_PATH, "utf8");
    const data = JSON.parse(raw);
    const client = data.web || data.installed;
    if (!client) { console.error("[Drive Debug] client_secret.json has no 'web' or 'installed' key. Top-level keys:", Object.keys(data).join(", ")); return null; }
    if (!client.client_id) { console.error("[Drive Debug] client_secret.json missing client_id"); return null; }
    if (!client.client_secret) { console.error("[Drive Debug] client_secret.json missing client_secret"); return null; }
    return { clientId: client.client_id, clientSecret: client.client_secret };
  } catch (e) {
    console.error("[Drive Debug] Failed to parse client_secret.json:", e.message);
    return null;
  }
}

function getStoredOAuthTokens() {
  // 1) Try file (local dev)
  if (fs.existsSync(OAUTH_TOKENS_PATH)) {
    try {
      const raw = fs.readFileSync(OAUTH_TOKENS_PATH, "utf8");
      const data = JSON.parse(raw);
      return data?.refresh_token ? data : null;
    } catch {
      return null;
    }
  }
  // 2) Fall back to env var (production/Render — set GOOGLE_DRIVE_OAUTH_TOKENS to the full JSON)
  const envTokens = process.env.GOOGLE_DRIVE_OAUTH_TOKENS;
  if (envTokens) {
    try {
      const data = JSON.parse(envTokens);
      if (!data?.refresh_token) { console.error("[Drive Debug] GOOGLE_DRIVE_OAUTH_TOKENS parsed but has no refresh_token. Keys:", Object.keys(data).join(", ")); return null; }
      return data;
    } catch (e) {
      console.error("[Drive] GOOGLE_DRIVE_OAUTH_TOKENS is not valid JSON:", e.message);
      return null;
    }
  }
  return null;
}

function isOAuthConfigured() {
  return Boolean(DRIVE_FOLDER_ID && getOAuthClientConfig() && getStoredOAuthTokens()?.refresh_token);
}

function isServiceAccountConfigured() {
  const creds = getServiceAccountCredentials();
  return Boolean(DRIVE_FOLDER_ID && creds?.client_email && creds?.private_key);
}

function isDriveConfigured() {
  return isOAuthConfigured() || isServiceAccountConfigured();
}

async function getDriveClientFromOAuth() {
  const config = getOAuthClientConfig();
  const tokens = getStoredOAuthTokens();
  if (!config || !tokens?.refresh_token) {
    throw new Error("Google Drive OAuth: not configured. Use Connect Google Drive to sign in.");
  }
  if (!DRIVE_FOLDER_ID) {
    throw new Error("Google Drive: GOOGLE_DRIVE_FOLDER_ID is not set (folder in your My Drive).");
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token || undefined,
    expiry_date: tokens.expiry_date || undefined,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();
  if (credentials.access_token) {
    oauth2Client.setCredentials(credentials);
    if (credentials.refresh_token || tokens.refresh_token) {
      try {
        const dir = path.dirname(OAUTH_TOKENS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          OAUTH_TOKENS_PATH,
          JSON.stringify(
            {
              refresh_token: credentials.refresh_token || tokens.refresh_token,
              access_token: credentials.access_token,
              expiry_date: credentials.expiry_date,
            },
            null,
            2
          ),
          "utf8"
        );
      } catch (_) {}
    }
  }

  return google.drive({ version: "v3", auth: oauth2Client });
}

function getDriveClientSync() {
  const creds = getServiceAccountCredentials();
  if (!creds?.client_email || !creds?.private_key) {
    throw new Error("Google Drive: missing service account credentials. See docs/GOOGLE_DRIVE_SETUP.md");
  }
  if (!DRIVE_FOLDER_ID) {
    throw new Error("Google Drive: GOOGLE_DRIVE_FOLDER_ID is not set. See docs/GOOGLE_DRIVE_SETUP.md");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

async function getDriveClient() {
  if (isOAuthConfigured()) {
    return getDriveClientFromOAuth();
  }
  return getDriveClientSync();
}

/**
 * Collect all PDFs under data dir, optionally filtered by symbol.
 * Returns { symbol, quarter, filename, localPath }[].
 */
function collectPdfFiles(symbolFilter = null) {
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
    return [];
  }

  const symbols = symbolFilter
    ? [String(symbolFilter).toUpperCase()]
    : fs.readdirSync(dataDir).filter((name) => {
        const full = path.join(dataDir, name);
        return fs.statSync(full).isDirectory() && !["download_log.json", "watcher_state.json"].includes(name);
      });

  const list = [];
  for (const symbol of symbols) {
    const symbolDir = path.join(dataDir, symbol);
    if (!fs.existsSync(symbolDir) || !fs.statSync(symbolDir).isDirectory()) continue;

    for (const quarter of fs.readdirSync(symbolDir)) {
      const quarterDir = path.join(symbolDir, quarter);
      if (!fs.statSync(quarterDir).isDirectory() || !quarter.startsWith("FY")) continue;

      const files = fs.readdirSync(quarterDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
      for (const filename of files) {
        list.push({
          symbol,
          quarter,
          filename,
          localPath: path.join(quarterDir, filename),
        });
      }
    }
  }
  return list;
}

// Required for Shared Drives: service accounts have no quota in "My Drive"
const DRIVE_OPTS = { supportsAllDrives: true };

/**
 * Ensure a folder exists under parentId with the given name; create if not. Returns folder id.
 */
async function ensureFolder(drive, parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    ...DRIVE_OPTS,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files?.length) {
    return res.data.files[0].id;
  }

  const create = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    ...DRIVE_OPTS,
  });
  return create.data.id;
}

/**
 * Upload local file to Drive at parentId with the given filename. Returns { id, webViewLink, name }.
 */
async function uploadFile(drive, parentId, localPath, filename) {
  const fileMetadata = { name: filename, parents: [parentId] };
  const media = {
    mimeType: "application/pdf",
    body: fs.createReadStream(localPath),
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id, webViewLink, name",
    ...DRIVE_OPTS,
  });

  return {
    id: file.data.id,
    webViewLink: file.data.webViewLink || null,
    name: file.data.name || filename,
  };
}

/**
 * Upload all (or filtered) announcements to Google Drive under:
 *   DRIVE_FOLDER_ID / Announcements / SYMBOL / QUARTER / filename.pdf
 * alreadyUploadedKeys: optional Set of "quarter|filename" to skip (no re-upload).
 * Returns { uploaded: { id, webViewLink, name, symbol, quarter }[], skipped, errors }.
 */
export async function uploadAnnouncementsToDrive(symbolFilter = null, alreadyUploadedKeys = null) {
  if (!isDriveConfigured()) {
    const err = new Error("Google Drive is not configured. Set GOOGLE_DRIVE_FOLDER_ID and service account credentials.");
    err.code = "DRIVE_NOT_CONFIGURED";
    throw err;
  }

  logger.info(LOG, `Upload starting. Symbol filter: ${symbolFilter ?? "all"}. Already uploaded keys: ${alreadyUploadedKeys?.size ?? 0}`);

  const drive = await getDriveClient();
  const files = collectPdfFiles(symbolFilter);
  logger.info(LOG, `Collected ${files.length} file(s) to process`);

  const uploaded = [];
  const errors = [];
  let skipped = 0;

  const rootId = DRIVE_FOLDER_ID;
  const announcementsFolderId = await ensureFolder(drive, rootId, DRIVE_UPLOAD_FOLDER_NAME);
  logger.info(LOG, `Target folder: Announcements (id=${announcementsFolderId?.slice(0, 8)}...)`);

  for (let i = 0; i < files.length; i++) {
    const { symbol, quarter, filename, localPath } = files[i];
    const n = i + 1;
    try {
      if (alreadyUploadedKeys && alreadyUploadedKeys.has(`${quarter}|${filename}`)) {
        skipped += 1;
        logger.info(LOG, `[${n}/${files.length}] Skip (already on Drive): ${symbol}/${quarter}/${filename}`);
        continue;
      }
      if (!fs.existsSync(localPath)) {
        logger.warn(LOG, `[${n}/${files.length}] File not found: ${localPath}`);
        errors.push({ symbol, quarter, filename, error: "File not found" });
        continue;
      }

      logger.info(LOG, `[${n}/${files.length}] Uploading: ${symbol}/${quarter}/${filename}`);
      const symbolFolderId = await ensureFolder(drive, announcementsFolderId, symbol);
      const quarterFolderId = await ensureFolder(drive, symbolFolderId, quarter);

      const result = await uploadFile(drive, quarterFolderId, localPath, filename);
      uploaded.push({
        ...result,
        symbol,
        quarter,
      });
      logger.info(LOG, `[${n}/${files.length}] Uploaded: ${symbol}/${quarter}/${filename} -> ${result?.id?.slice(0, 8)}...`);
      if (DELETE_LOCAL_AFTER_UPLOAD && fs.existsSync(localPath)) {
        try {
          fs.unlinkSync(localPath);
          const quarterDir = path.dirname(localPath);
          const metaPath = path.join(quarterDir, "meta.json");
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
            if (Array.isArray(meta)) {
              const next = meta.filter((m) => m.filename !== filename);
              if (next.length) fs.writeFileSync(metaPath, JSON.stringify(next, null, 2), "utf8");
              else fs.unlinkSync(metaPath);
            }
          }
          logger.info(LOG, `[${n}/${files.length}] Deleted local after upload: ${filename}`);
        } catch (_) {}
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err);
      if (/insufficient|permission|403|forbidden/i.test(message)) {
        const creds = getServiceAccountCredentials();
        const saEmail = creds?.client_email || "your-service-account@project.iam.gserviceaccount.com";
        message += ` — Share the Drive folder (ID: ${DRIVE_FOLDER_ID}) with ${saEmail} as Editor. See docs/GOOGLE_DRIVE_SETUP.md.`;
      }
      logger.error(LOG, `[${n}/${files.length}] Failed: ${symbol}/${quarter}/${filename}`, message);
      errors.push({
        symbol,
        quarter,
        filename,
        error: message,
      });
    }
  }

  logger.info(LOG, `Upload complete. Uploaded: ${uploaded.length}, Skipped: ${skipped}, Errors: ${errors.length}`);
  return {
    uploaded,
    skipped,
    errors: errors.length ? errors : undefined,
  };
}

/**
 * Permanently delete a file from Google Drive by ID.
 * Used when resetting filings so Drive stays in sync with local reset.
 * @param {string} fileId - Drive file ID
 * @throws if Drive not configured or API error
 */
export async function deleteDriveFile(fileId) {
  if (!fileId || !isDriveConfigured()) return;
  const drive = await getDriveClient();
  await drive.files.delete({
    fileId,
    ...DRIVE_OPTS,
  });
  logger.info(LOG, `Deleted from Drive: ${fileId.slice(0, 12)}...`);
}

/** Returns { driveConfigured, needsConnect }. needsConnect = true when OAuth client + folder are set but user has not connected. */
function getDriveStatus() {
  const configured = isDriveConfigured();
  const oauthClientAndFolder = Boolean(DRIVE_FOLDER_ID && getOAuthClientConfig());
  const hasTokens = Boolean(getStoredOAuthTokens()?.refresh_token);
  const needsConnect = oauthClientAndFolder && !hasTokens && !isServiceAccountConfigured();
  return { driveConfigured: configured, needsConnect };
}

export { isDriveConfigured, getDriveStatus };
