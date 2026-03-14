import express from "express";
import { resetInsightsHandler } from "../controllers/stocks.controller.js";

export const stocksRouter = express.Router();

stocksRouter.post("/api/stocks/:id/reset-insights", resetInsightsHandler);

