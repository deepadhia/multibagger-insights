import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { getDataDir } from "./config/dataDir.js";
import { healthRouter } from "./routes/health.routes.js";
import { stocksRouter } from "./routes/stocks.routes.js";
import { transcriptsRouter } from "./routes/transcripts.routes.js";
import { proxyRouter } from "./routes/proxy.routes.js";
import { priceRouter } from "./routes/price.routes.js";
import { financialsRouter } from "./routes/financials.routes.js";
import {
  loginHandler,
  logoutHandler,
  meHandler,
  driveStartHandler,
  driveCallbackHandler,
} from "./routes/auth.routes.js";
import { geminiRouter } from "./routes/gemini.routes.js";
import { marketRouter } from "./routes/market.routes.js";
import { requireAuth } from "./middleware/requireAuth.js";

export const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:8080",
  credentials: true,
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// --- Public ---
app.use(healthRouter);

app.post("/api/auth/login", loginHandler);
app.post("/api/auth/logout", logoutHandler);
app.get("/api/auth/me", meHandler);

// Google redirects here (must stay public)
app.get("/api/auth/drive/callback", driveCallbackHandler);

// --- Protected (JWT cookie or Bearer) ---
app.use(requireAuth);

app.get("/api/auth/drive/start", driveStartHandler);

// Static files for downloaded PDFs
app.use("/files", express.static(getDataDir()));

app.use(proxyRouter);
app.use(marketRouter);
app.use(priceRouter);
app.use(financialsRouter);
app.use(stocksRouter);
app.use(transcriptsRouter);
app.use(geminiRouter);
