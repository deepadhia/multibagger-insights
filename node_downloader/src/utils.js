import fs from "node:fs";
import path from "node:path";

export function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function readJsonSync(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export function writeJsonSync(filePath, value) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

