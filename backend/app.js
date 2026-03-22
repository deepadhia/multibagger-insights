import express from "express";
import { getDataDir } from "./config/dataDir.js";
import { healthRouter } from "./routes/health.routes.js";
import { stocksRouter } from "./routes/stocks.routes.js";
import { transcriptsRouter } from "./routes/transcripts.routes.js";
import { proxyRouter } from "./routes/proxy.routes.js";
import { priceRouter } from "./routes/price.routes.js";
import { financialsRouter } from "./routes/financials.routes.js";
import authRouter from "./routes/auth.routes.js";
import { geminiRouter } from "./routes/gemini.routes.js";

export const app = express();

app.use(express.json());

// Static files for downloaded PDFs (same path as listing uses)
app.use("/files", express.static(getDataDir()));

// API routes
app.use(healthRouter);
app.use(authRouter);
app.use(proxyRouter);
app.use(priceRouter);
app.use(financialsRouter);
app.use(stocksRouter);
app.use(transcriptsRouter);
app.use(geminiRouter);

