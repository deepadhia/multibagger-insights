/**
 * Standalone BSE PDF downloader (Node) for testing.
 *
 * Usage examples (from node_downloader/):
 *
 *   node src/bseDownloaderTest.js --url https://www.bseindia.com/xml-data/corpfiling/AttachHis/....pdf
 *   node src/bseDownloaderTest.js --url <url> --referer https://www.screener.in/company/...
 *
 * This uses the same robust logic as the merge script:
 * - Browser-like headers + optional Referer
 * - Retries on failure
 * - SSL fallback (insecure TLS) for bad certificates
 */
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import https from "node:https";
import tls from "node:tls";

function parseArgs() {
  const args = process.argv.slice(2);
  let url = "";
  let referer = "";
  let outDir = "bse_test_downloads";

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--url" && i + 1 < args.length) {
      url = args[++i];
    } else if (a === "--referer" && i + 1 < args.length) {
      referer = args[++i];
    } else if (a === "--out" && i + 1 < args.length) {
      outDir = args[++i];
    }
  }
  if (!url) {
    throw new Error("Missing --url <BSE_PDF_URL>");
  }
  return { url, referer, outDir };
}

function buildClient(referrer) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/122.0.0.0 Safari/537.36",
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
  };
  if (referrer) {
    headers.Referer = referrer;
  }
  return axios.create({
    headers,
    timeout: 30000,
    maxRedirects: 5,
  });
}

// Raw TLS fallback for broken BSE responses that Node's HTTP parser rejects.
async function downloadViaRawTls(url, referer, savePath) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : 443;
  const pathWithQuery = parsed.pathname + (parsed.search || "");

  const headers = [
    `GET ${pathWithQuery} HTTP/1.1`,
    `Host: ${host}`,
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/122.0.0.0 Safari/537.36",
    "Accept: application/pdf,application/octet-stream,*/*",
    "Connection: close",
  ];
  if (referer) {
    headers.push(`Referer: ${referer}`);
  }
  const requestText = headers.join("\r\n") + "\r\n\r\n";

  const bodyBuffer = await new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
      },
      () => {
        socket.write(requestText);
      },
    );
    const chunks = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", (err) => reject(err));
    socket.on("end", () => {
      const buf = Buffer.concat(chunks);
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return reject(new Error("No header/body separator in raw response"));
      }
      const headerPart = buf.slice(0, headerEnd).toString("latin1");
      let bodyPart = buf.slice(headerEnd + 4);

      const lower = headerPart.toLowerCase();
      if (lower.includes("transfer-encoding: chunked")) {
        try {
          const out = [];
          let i = 0;
          while (i < bodyPart.length) {
            const lineEnd = bodyPart.indexOf("\r\n", i);
            if (lineEnd === -1) break;
            const sizeHex = bodyPart
              .slice(i, lineEnd)
              .toString("ascii")
              .trim();
            const size = parseInt(sizeHex, 16);
            if (!Number.isFinite(size)) break;
            if (size === 0) break;
            const chunkStart = lineEnd + 2;
            const chunkEnd = chunkStart + size;
            out.push(bodyPart.slice(chunkStart, chunkEnd));
            i = chunkEnd + 2;
          }
          bodyPart = Buffer.concat(out);
        } catch {
          // if dechunking fails, keep raw bodyPart
        }
      }

      resolve(bodyPart);
    });
  });

  fs.writeFileSync(savePath, bodyBuffer);
  console.log(`Saved via raw TLS: ${savePath}`);
}

async function downloadBsePdf(url, referer, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const parsed = new URL(url);
  const rawName = path.basename(parsed.pathname) || "bse_file.pdf";
  const idPart = rawName.replace(/\.pdf$/i, "");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const fileName = `bse_${idPart}_${stamp}.pdf`;
  const savePath = path.join(outDir, fileName);

  const client = buildClient(referer);
  let lastError = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let res;
      try {
        res = await client.get(url, { responseType: "arraybuffer" });
      } catch (err) {
        if (err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
          console.warn(
            `SSL verify failed for ${url.slice(
              0,
              80,
            )}, retrying with insecure TLS...`,
          );
          const insecureClient = axios.create({
            ...client.defaults,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          });
          res = await insecureClient.get(url, { responseType: "arraybuffer" });
        } else if (
          typeof err.message === "string" &&
          err.message.includes("Parse Error")
        ) {
          await downloadViaRawTls(url, referer, savePath);
          return;
        } else {
          throw err;
        }
      }

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }

      fs.writeFileSync(savePath, res.data);
      console.log(`Saved: ${savePath}`);
      return;
    } catch (err) {
      lastError = err;
      console.warn(
        `Attempt ${attempt + 1} failed for ${url.slice(
          0,
          80,
        )}: ${err && err.message ? err.message : err}`,
      );
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  console.error(
    `Final failure for ${url.slice(
      0,
      80,
    )}: ${lastError && lastError.message ? lastError.message : lastError}`,
  );
}

async function main() {
  try {
    const { url, referer, outDir } = parseArgs();
    console.log("BSE download test");
    console.log("URL    :", url);
    if (referer) {
      console.log("Referer:", referer);
    }
    console.log("Out dir:", outDir);
    await downloadBsePdf(url, referer, outDir);
  } catch (err) {
    console.error("Usage error:", err.message);
    console.error(
      "Example: node src/bseDownloaderTest.js --url <BSE_URL> --referer https://www.screener.in/company/... --out bse_test",
    );
    process.exit(1);
  }
}

// Always run when invoked via `node src/bseDownloaderTest.js`
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

