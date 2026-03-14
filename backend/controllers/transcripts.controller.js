import {
  downloadTranscriptsPipeline,
  listDownloadedFilesForSymbol,
} from "../services/transcripts.service.js";

export async function downloadTranscriptsHandler(req, res) {
  const { window = "3q", symbols, stockIds, useWatchlist = true } = req.body ?? {};

  try {
    const result = await downloadTranscriptsPipeline({
      window,
      symbols,
      stockIds,
      useWatchlist,
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

export function listTranscriptFilesHandler(req, res) {
  try {
    const { symbol, files } = listDownloadedFilesForSymbol(req.params.symbol);
    res.json({ ok: true, symbol, files });
  } catch (err) {
    console.error("transcripts/files error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

