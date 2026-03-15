import express from "express";
import { fetchPriceHandler, refreshAllPricesHandler } from "../controllers/price.controller.js";

export const priceRouter = express.Router();

priceRouter.post("/api/prices/fetch", fetchPriceHandler);
priceRouter.post("/api/prices/refresh-all", refreshAllPricesHandler);
