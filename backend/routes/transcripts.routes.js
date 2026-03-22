import express from "express";
import {
  downloadTranscriptsHandler,
  listTranscriptFilesHandler,
  uploadToDriveHandler,
  driveStatusHandler,
  resetTranscriptsHandler,
  resetAllTranscriptsHandler,
  deleteFilingHandler,
  debugSymbolHandler,
  debugScreenerLinksHandler,
} from "../controllers/transcripts.controller.js";

export const transcriptsRouter = express.Router();

transcriptsRouter.post("/api/transcripts/download", downloadTranscriptsHandler);
transcriptsRouter.get("/api/transcripts/files/:symbol", listTranscriptFilesHandler);
transcriptsRouter.get("/api/transcripts/debug/screener-links/:symbol", debugScreenerLinksHandler);
transcriptsRouter.get("/api/transcripts/debug/:symbol", debugSymbolHandler);
transcriptsRouter.post("/api/transcripts/upload-to-drive", uploadToDriveHandler);
transcriptsRouter.get("/api/transcripts/drive-status", driveStatusHandler);
transcriptsRouter.post("/api/transcripts/reset", resetTranscriptsHandler);
transcriptsRouter.post("/api/transcripts/reset-all", resetAllTranscriptsHandler);
transcriptsRouter.post("/api/transcripts/delete-file", deleteFilingHandler);

