import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HISTORY_WINDOWS, DATA_DIR } from "./config.js";
import { verifyOutput } from "./verifyDownloads.js";
import { ensureDirSync } from "./utils.js";
import { runHistorical } from "./nseDownloader.js";
import { runScreenerScraper } from "./screenerScraper.js";
import { runMerge } from "./mergeScreenerIntoNse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  let window = "3q";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--window" && i + 1 < args.length) {
      window = args[++i];
    }
  }
  if (!HISTORY_WINDOWS[window]) {
    window = "3q";
  }
  return { window };
}

async function main() {
  const { window } = parseArgs();

  // Fresh run: clear Node data directory so we don't mix windows
  if (fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
  ensureDirSync(DATA_DIR);
  console.log("Data directory (Node):", DATA_DIR);

  try {
    console.log("\n" + "=".repeat(60));
    console.log("STEP: NSE historical (earnings + investor presentation)");
    console.log("=".repeat(60));
    await runHistorical({ symbolFilter: null, historyWindow: window });
    console.log("[OK] NSE historical completed");

    console.log("\n" + "=".repeat(60));
    console.log("STEP: Screener scrape (concall + PPT links)");
    console.log("=".repeat(60));
    await runScreenerScraper();
    console.log("[OK] Screener scrape completed");

    console.log("\n" + "=".repeat(60));
    console.log("STEP: Merge (backfill from Screener + concall transcripts)");
    console.log("=".repeat(60));
    await runMerge({ window });
    console.log("[OK] Merge completed");
  } catch (err) {
    console.error("\n[FAIL] Pipeline error:", err.message);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP: Verify output (Node)");
  console.log("=".repeat(60));
  const { ok, report } = verifyOutput();
  console.log(report);
  console.log("-".repeat(50));
  if (ok) {
    console.log(
      "OUTPUT IS PROPER (Node): All files in allowed categories, structure by symbol/quarter looks good.",
    );
  } else {
    console.log(
      "OUTPUT CHECK (Node): Review report above. Fix any failed steps or unexpected files and re-run if needed.",
    );
  }
  process.exit(ok ? 0 : 1);
}

main();

