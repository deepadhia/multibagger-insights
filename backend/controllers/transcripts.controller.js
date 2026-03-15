import {
  downloadTranscriptsPipeline,
  listDownloadedFilesForSymbol,
  resetTranscriptFilesByPeriod,
  saveFilingDriveLinks,
  getAlreadyUploadedKeys,
  getSymbolDebugInfo,
  getScreenerLinksDebug,
  deleteFilingFile,
} from "../services/transcripts.service.js";
import { uploadAnnouncementsToDrive, isDriveConfigured, getDriveStatus } from "../services/drive.service.js";

export async function downloadTranscriptsHandler(req, res) {
  const { window = "3q", symbols, stockIds, useWatchlist = true, onlyMissing = false, uploadAfterDownload = false } = req.body ?? {};

  try {
    const result = await downloadTranscriptsPipeline({
      window,
      symbols,
      stockIds,
      useWatchlist,
      onlyMissing: Boolean(onlyMissing),
      uploadAfterDownload: Boolean(uploadAfterDownload),
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("transcripts/download error:", err);
    if (err && err.code === "NO_SYMBOLS") {
      return res.status(400).json({ ok: false, error: err.message });
    }
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export async function listTranscriptFilesHandler(req, res) {
  try {
    const { symbol, files } = await listDownloadedFilesForSymbol(req.params.symbol);
    res.json({ ok: true, symbol, files });
  } catch (err) {
    console.error("transcripts/files error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export async function uploadToDriveHandler(req, res) {
  try {
    const symbol = req.body?.symbol ? String(req.body.symbol).toUpperCase() : null;

    if (!isDriveConfigured()) {
      return res.status(503).json({
        ok: false,
        error: "Google Drive upload is not configured. See docs/GOOGLE_DRIVE_SETUP.md",
      });
    }

    const alreadyUploadedKeys = symbol ? await getAlreadyUploadedKeys(symbol) : null;
    const result = await uploadAnnouncementsToDrive(symbol, alreadyUploadedKeys);
    if (result.uploaded?.length > 0) {
      await saveFilingDriveLinks(result.uploaded);
    }
    res.json({
      ok: true,
      uploaded: result.uploaded.length,
      total: result.uploaded.length + (result.errors?.length || 0) + result.skipped,
      files: result.uploaded,
      errors: result.errors,
    });
  } catch (err) {
    console.error("transcripts/upload-to-drive error:", err);
    if (err?.code === "DRIVE_NOT_CONFIGURED") {
      return res.status(503).json({ ok: false, error: err.message });
    }
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export function driveStatusHandler(_req, res) {
  try {
    const { driveConfigured, needsConnect } = getDriveStatus();
    res.json({ ok: true, driveConfigured, needsConnect: needsConnect || false });
  } catch {
    res.json({ ok: true, driveConfigured: false, needsConnect: false });
  }
}

/** GET /api/transcripts/debug/:symbol - inspect DB data for a ticker (e.g. TIMETECHNO). */
export async function debugSymbolHandler(req, res) {
  try {
    const symbol = req.params.symbol;
    const info = await getSymbolDebugInfo(symbol);
    if (info.error) {
      return res.status(500).json({ ok: false, ...info });
    }
    res.json({ ok: true, ...info });
  } catch (err) {
    console.error("transcripts/debug error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/** GET /api/transcripts/debug/screener-links/:symbol - inspect what Screener scrape captured (earnings vs presentation vs concall). */
export function debugScreenerLinksHandler(req, res) {
  try {
    const symbol = req.params.symbol;
    const info = getScreenerLinksDebug(symbol);
    res.json({ ok: true, ...info });
  } catch (err) {
    console.error("transcripts/debug/screener-links error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export async function resetTranscriptsHandler(req, res) {
  try {
    const { period, symbol } = req.body ?? {};
    if (!["3m", "6m", "1y"].includes(period)) {
      return res.status(400).json({ ok: false, error: "period must be 3m, 6m, or 1y" });
    }
    const result = await resetTranscriptFilesByPeriod(period, symbol || null);
    res.json({
      ok: true,
      deleted: result.deleted,
      deletedFromDrive: result.deletedFromDrive ?? 0,
      errors: result.errors,
    });
  } catch (err) {
    console.error("transcripts/reset error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/** DELETE a single filing: local file, Drive (if uploaded), and DB row. Body: { symbol, quarter, filename }. */
export async function deleteFilingHandler(req, res) {
  try {
    const { symbol, quarter, filename } = req.body ?? {};
    const result = await deleteFilingFile(symbol, quarter, filename);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    res.json({
      ok: true,
      deletedLocal: result.deletedLocal,
      deletedFromDrive: result.deletedFromDrive,
    });
  } catch (err) {
    console.error("transcripts/delete-filing error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

