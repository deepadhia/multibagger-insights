import express from "express";
import {
  downloadTranscriptsHandler,
  listTranscriptFilesHandler,
} from "../controllers/transcripts.controller.js";

export const transcriptsRouter = express.Router();

transcriptsRouter.post("/api/transcripts/download", downloadTranscriptsHandler);
transcriptsRouter.get("/api/transcripts/files/:symbol", listTranscriptFilesHandler);

