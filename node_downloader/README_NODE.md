## Node.js NSE + Screener Downloader (Service-friendly)

This folder contains a **Node.js port** of the Python NSE + Screener downloader so you can plug it directly into a Node backend or ship it as a service, without touching the existing working Python pipeline.

It mirrors the same high-level behaviour:

- **NSE** for earnings results and investor presentations (per quarter)
- **Screener.in** for concall transcripts, and as a **fallback** for earnings/presentations when NSE is missing them
- Output organised as:

```bash
data/
  <SHARE_NAME>/
    FY26-Q2/
      earnings_result_*.pdf
      investor_presentation_*.pdf
      concall_transcript_*.pdf
      meta.json
```

All files are written to the **same `data/` folder at repo root**, so Python and Node pipelines can coexist and you can switch between them.

---

## Setup

From the root of the repo:

```bash
cd node_downloader
npm install
```

Environment (optional but recommended for Screener):

- **`SCREENER_COOKIE`** – your Screener session cookie, e.g.:

```bash
export SCREENER_COOKIE="sessionid=xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

On Windows PowerShell:

```powershell
$env:SCREENER_COOKIE = "sessionid=xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## Watchlist & Config

Edit `src/config.js`:

- **`WATCHLIST`** – list of NSE tickers (same as Python)
- **`DATA_DIR`** – already points to the root `data/` folder
- **`HISTORY_WINDOWS`** – maps `6m`, `1y`, `2y`, `3q` to number of days for NSE historical downloads

---

## One-shot pipeline (Node)

Run the full Node pipeline (NSE → Screener → Merge → Verify) from inside `node_downloader`:

```bash
# Default: last 3 quarters from NSE
npm start

# Or pick a window explicitly
node src/runFullDownload.js --window 6m   # last 6 months
node src/runFullDownload.js --window 1y   # last 1 year
node src/runFullDownload.js --window 2y   # last 2 years
node src/runFullDownload.js --window 3q   # last 3 quarters (default)
```

The script will:

1. Run **NSE historical** via `src/nseDownloader.js` (earnings + investor presentations, per quarter, deduped)
2. Run **Screener scraper** via `src/screenerScraper.js` to build `screener_links.json`
3. Run **merge/backfill** via `src/mergeScreenerIntoNse.js`:
   - Backfill **earnings** and **presentations** from Screener only when NSE is missing them, by matching the fiscal quarter
   - Add **concall transcripts** from Screener only
4. Run **verification** via `src/verifyDownloads.js` and print a per-symbol/quarter matrix

Exit code:

- `0` – **OUTPUT IS PROPER (Node)** – structure and categories look good
- `1` – check the report for unexpected files or errors

---

## Individual scripts

From `node_downloader`:

- **NSE historical (Node)**

```bash
# Default: last 3 quarters, whole watchlist
node src/nseDownloader.js --mode historical

# With specific windows
node src/nseDownloader.js --mode historical --history-window 6m
node src/nseDownloader.js --mode historical --history-window 1y
node src/nseDownloader.js --mode historical --history-window 2y
node src/nseDownloader.js --mode historical --history-window 3q

# Single symbol
node src/nseDownloader.js --mode historical --symbol HBLENGINE
node src/nseDownloader.js --mode historical --symbol HBLENGINE --history-window 1y
```

- **Screener scrape (Node)**

```bash
node src/screenerScraper.js
```

Writes `screener_links.json` at the repo root.

- **Merge Screener into NSE (Node)**

```bash
node src/mergeScreenerIntoNse.js
```

Uses `screener_links.json` + existing `data/` to:

- Backfill **earnings_result** and **investor_presentation** per quarter when missing in NSE
- Add **concall_transcript** per quarter from Screener only

- **Verify downloads (Node)**

```bash
node src/verifyDownloads.js
```

Outputs:

- Total PDFs
- Ensures files are only in categories: `concall_transcript`, `earnings_result`, `investor_presentation`
- Per-symbol/quarter matrix (E/P/C)

> Note: The Node verifier does **not** yet do deep PDF content inspection like the Python `verify_downloads.py --content-check`. If you need that in Node as well, we can extend this with a PDF parser library.

---

## Embedding into your existing Node backend

- Treat `node_downloader` as a library/module:
  - Call `node src/runFullDownload.js --window 3q` from your backend using `child_process`, **or**
  - Import the individual modules (`nseDownloader`, `screenerScraper`, `mergeScreenerIntoNse`) and wire them into your own job queue / scheduler.
- The key contract is the **`data/` folder** and `screener_links.json`, which are shared with the Python tools.

