import express from "express";
import { importGeminiResponseHandler } from "../controllers/gemini.controller.js";

export const geminiRouter = express.Router();

// Accepts normalized Gemini import payload and performs zero-trust validation + DB writes.
geminiRouter.post("/api/gemini/import", importGeminiResponseHandler);

