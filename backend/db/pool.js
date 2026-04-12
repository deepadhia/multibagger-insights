import pkg from "pg";
import { DATABASE_URL } from "../config/env.js";

const { Pool } = pkg;

// Manually parse to absolutely guarantee the project-ref isn't dropped by pg or environment overrides
let parsedUrl;
try {
  parsedUrl = new URL(DATABASE_URL);
} catch (e) {
  console.error("Invalid DATABASE_URL format:", e.message);
  parsedUrl = { username: "", password: "", hostname: "", port: "5432", pathname: "/postgres" };
}

export const pool = new Pool({
  user: parsedUrl.username,
  password: decodeURIComponent(parsedUrl.password),
  host: parsedUrl.hostname,
  port: parseInt(parsedUrl.port, 10) || 5432,
  database: parsedUrl.pathname.replace("/", ""),
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

