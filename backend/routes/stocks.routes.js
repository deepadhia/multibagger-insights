import express from "express";
import { resetInsightsHandler, resetAllJsonOutputsHandler } from "../controllers/stocks.controller.js";

export const stocksRouter = express.Router();

stocksRouter.post("/api/stocks/:id/reset-insights", resetInsightsHandler);
stocksRouter.post("/api/stocks/reset-all-json", resetAllJsonOutputsHandler);

