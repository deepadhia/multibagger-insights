import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR as CONFIG_DATA_DIR } from "../../node_downloader/src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Data directory for transcript/filing PDFs. Prefer process.cwd()/data_node if it exists
 * (so server and listing use the same path regardless of how the app is started).
 */
export function getDataDir() {
  const cwdData = path.join(process.cwd(), "data_node");
  if (fs.existsSync(cwdData) && fs.statSync(cwdData).isDirectory()) {
    return cwdData;
  }
  return CONFIG_DATA_DIR;
}
