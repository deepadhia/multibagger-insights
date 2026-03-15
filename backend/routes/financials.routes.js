import express from "express";
import { fetchFinancialsHandler, refreshAllFinancialsHandler } from "../controllers/financials.controller.js";

export const financialsRouter = express.Router();

financialsRouter.post("/api/financials/fetch", fetchFinancialsHandler);
financialsRouter.post("/api/financials/refresh-all", refreshAllFinancialsHandler);
