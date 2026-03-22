import express from "express";
import { stockSearchHandler, stockEnrichHandler } from "../controllers/market.controller.js";

export const marketRouter = express.Router();

marketRouter.get("/api/market/stock-search", stockSearchHandler);
marketRouter.get("/api/market/stock-enrich", stockEnrichHandler);
