import express from "express";
import path from "node:path";
import { DATA_DIR } from "../node_downloader/src/config.js";
import { healthRouter } from "./routes/health.routes.js";
import { stocksRouter } from "./routes/stocks.routes.js";
import { transcriptsRouter } from "./routes/transcripts.routes.js";

export const app = express();

app.use(express.json());

// Static files for downloaded PDFs
app.use("/files", express.static(DATA_DIR));

// API routes
app.use(healthRouter);
app.use(stocksRouter);
app.use(transcriptsRouter);

