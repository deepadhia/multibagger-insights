import express from "express";
import { fetchFinancialsHandler, fetchPriceHandler } from "../controllers/proxy.controller.js";

export const proxyRouter = express.Router();

proxyRouter.post("/api/proxy/fetch-financials", fetchFinancialsHandler);
proxyRouter.post("/api/proxy/fetch-price", fetchPriceHandler);
