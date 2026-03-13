import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BSE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.bseindia.com/",
  Origin: "https://www.bseindia.com",
};

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Indian FY quarter detection from filing date
// Results are typically filed 1-2 months after quarter end
// Q1: Apr-Jun (filed Jul-Aug), Q2: Jul-Sep (filed Oct-Nov), Q3: Oct-Dec (filed Jan-Feb), Q4: Jan-Mar (filed Apr-May)
function detectQuarter(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();

  // Map filing month to the quarter whose results are being discussed
  if (month >= 1 && month <= 2) {
    // Jan-Feb → Q3 results (Oct-Dec), FY ends Mar of same year
    return `Q3 FY${String(year).slice(2)}`;
  } else if (month >= 4 && month <= 5) {
    // Apr-May → Q4 results (Jan-Mar), FY just ended
    return `Q4 FY${String(year).slice(2)}`;
  } else if (month >= 7 && month <= 8) {
    // Jul-Aug → Q1 results (Apr-Jun), FY ends Mar next year
    return `Q1 FY${String(year + 1).slice(2)}`;
  } else if (month >= 10 && month <= 11) {
    // Oct-Nov → Q2 results (Jul-Sep)
    return `Q2 FY${String(year + 1).slice(2)}`;
  } else if (month === 3) {
    // March could be Q3 late filing
    return `Q3 FY${String(year).slice(2)}`;
  } else if (month === 6) {
    // June could be Q4 late filing
    return `Q4 FY${String(year).slice(2)}`;
  } else if (month === 9) {
    return `Q1 FY${String(year + 1).slice(2)}`;
  } else {
    // Dec
    return `Q2 FY${String(year + 1).slice(2)}`;
  }
}

// Detect type from headline
function detectType(headline: string): string {
  const h = headline.toLowerCase();
  if (h.includes("transcript") || h.includes("concall") || h.includes("con call") || h.includes("conference call")) {
    return "concall_transcript";
  }
  if (h.includes("earnings call")) {
    return "earnings";
  }
  if (h.includes("investor presentation") || h.includes("presentation")) {
    return "presentation";
  }
  if (h.includes("analyst meet")) {
    return "analyst_meet";
  }
  return "transcript";
}

type LinkItem = {
  title: string;
  date: string;
  source: string;
  url: string;
  type: string;
  quarter: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, company_name, screener_slug } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcripts: LinkItem[] = [];
    const orderAnnouncements: LinkItem[] = [];

    const EXCLUDE_KEYWORDS = [
      "intimation", "prior intimation", "regulation 30", "regulation 33",
      "board meeting", "outcome of board", "compliance certificate",
      "newspaper publication", "corrigendum", "clarification",
      "record date", "dividend", "agm", "egm", "postal ballot",
      "book closure", "loss of share", "duplicate share",
      "change in director", "cessation", "appointment",
      "resignation", "disclosure under", "voting results",
      "scrutinizer report", "annual report", "notice of",
    ];

    const ORDER_KEYWORDS = [
      "new order", "order win", "order received", "order bagged",
      "contract awarded", "letter of intent", "loi received",
      "work order", "purchase order", "order book",
    ];

    const TRANSCRIPT_KEYWORDS = [
      "transcript", "concall", "con call", "conference call",
      "earnings call", "analyst meet", "investor presentation",
      "investor meet", "presentation", "annual report",
      "investor day", "ppt", "corporate presentation",
    ];

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 1);

    const bseSearchTerms = [ticker];
    if (company_name) {
      const firstWord = company_name.split(/\s+/)[0];
      if (firstWord.length > 2 && firstWord.toUpperCase() !== ticker.toUpperCase()) {
        bseSearchTerms.push(firstWord);
      }
    }

    const processBseItems = (table: any[]) => {
      for (const item of table) {
        const headline = (item.NEWSSUB || "").toLowerCase();
        const attachUrl = item.ATTACHMENTNAME || "";

        const newsDate = item.NEWS_DT || item.DT_TM || "";
        let dateStr = "";
        try {
          const d = new Date(newsDate);
          if (!isNaN(d.getTime())) dateStr = d.toISOString().split("T")[0];
        } catch { /* skip */ }

        const quarter = detectQuarter(dateStr);

        const buildLink = (title: string, type: string): LinkItem => ({
          title: title || "Filing",
          date: dateStr,
          source: "BSE",
          url: attachUrl.startsWith("http") ? attachUrl : `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${attachUrl}`,
          type,
          quarter,
        });

        // Check for new order announcements
        if (ORDER_KEYWORDS.some(k => headline.includes(k))) {
          orderAnnouncements.push(buildLink(item.NEWSSUB || "New Order", "order"));
          continue;
        }

        // Filter for transcript/concall related filings
        const isTranscript = TRANSCRIPT_KEYWORDS.some(k => headline.includes(k));
        if (!isTranscript) continue;

        // Exclude intimations & generic notices (but keep if explicitly "transcript")
        const isExcluded = EXCLUDE_KEYWORDS.some(k => headline.includes(k));
        if (isExcluded && !headline.includes("transcript")) continue;

        transcripts.push(buildLink(item.NEWSSUB || "Transcript", detectType(headline)));
      }
    };

    for (const searchTerm of bseSearchTerms) {
      const categories = ["Result", "Corp. Action"];
      for (const cat of categories) {
        try {
          const bseUrl = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=${encodeURIComponent(cat)}&strPrevDate=${formatDate(fromDate)}&strScrip=${encodeURIComponent(searchTerm)}&strSearch=P&strToDate=${formatDate(toDate)}&strType=C`;
          console.log(`Searching BSE [${cat}] for: ${searchTerm}`);
          const bseResp = await fetch(bseUrl, { headers: BSE_HEADERS });
          if (bseResp.ok) {
            const data = await bseResp.json();
            const table = data?.Table || [];
            console.log(`BSE [${cat}] returned ${table.length} results for ${searchTerm}`);
            processBseItems(table);
          } else {
            console.log(`BSE [${cat}] search failed for ${searchTerm}: ${bseResp.status}`);
          }
        } catch (e) {
          console.error(`BSE [${cat}] error for ${searchTerm}:`, e);
        }
      }
    }

    // === SOURCE 2: Screener.in ===
    const sessionId = Deno.env.get("SCREENER_SESSION_ID");
    const csrfToken = Deno.env.get("SCREENER_CSRF_TOKEN");
    const slug = screener_slug || ticker;

    if (sessionId && csrfToken) {
      try {
        console.log(`Fetching Screener.in page for ${slug}`);
        const screenerUrl = `https://www.screener.in/company/${slug}/`;
        const resp = await fetch(screenerUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Cookie: `sessionid=${sessionId}; csrftoken=${csrfToken}`,
            Referer: "https://www.screener.in/",
          },
        });

        if (resp.ok) {
          const html = await resp.text();
          const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]*(?:transcript|concall|con call|conference call|earnings call|investor presentation)[^<]*)<\/a>/gi;
          let match;
          while ((match = linkPattern.exec(html)) !== null) {
            const url = match[1];
            const title = match[2].trim();
            if (url && title) {
              // Try to extract quarter from title (e.g., "Concall Transcript Q3 FY26")
              const qMatch = title.match(/Q([1-4])\s*FY\s*(\d{2,4})/i);
              const quarter = qMatch ? `Q${qMatch[1]} FY${qMatch[2].slice(-2)}` : "";

              transcripts.push({
                title,
                date: "",
                source: "Screener",
                url: url.startsWith("http") ? url : `https://www.screener.in${url}`,
                type: detectType(title),
                quarter,
              });
            }
          }

          const docPattern = /class="documents"[\s\S]*?<\/section>/gi;
          const docMatch = docPattern.exec(html);
          if (docMatch) {
            const docSection = docMatch[0];
            const docLinkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
            let dlMatch;
            while ((dlMatch = docLinkPattern.exec(docSection)) !== null) {
              const url = dlMatch[1];
              const title = dlMatch[2].trim().toLowerCase();
              if (
                (title.includes("concall") || title.includes("transcript") || title.includes("conference")) &&
                !transcripts.some(t => t.url === url)
              ) {
                const qMatch = dlMatch[2].match(/Q([1-4])\s*FY\s*(\d{2,4})/i);
                const quarter = qMatch ? `Q${qMatch[1]} FY${qMatch[2].slice(-2)}` : "";
                transcripts.push({
                  title: dlMatch[2].trim(),
                  date: "",
                  source: "Screener",
                  url: url.startsWith("http") ? url : `https://www.screener.in${url}`,
                  type: "concall_transcript",
                  quarter,
                });
              }
            }
          }
          console.log(`Found ${transcripts.filter(t => t.source === "Screener").length} links from Screener`);
        } else {
          console.log(`Screener fetch failed: ${resp.status}`);
        }
      } catch (e) {
        console.error("Screener error:", e);
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = transcripts.filter(t => {
      if (seen.has(t.url)) return false;
      seen.add(t.url);
      return true;
    });
    unique.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const seenOrders = new Set<string>();
    const uniqueOrders = orderAnnouncements.filter(t => {
      if (seenOrders.has(t.url)) return false;
      seenOrders.add(t.url);
      return true;
    });
    uniqueOrders.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return new Response(JSON.stringify({
      success: true,
      ticker,
      count: unique.length,
      transcripts: unique,
      orders: uniqueOrders,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-transcript-links error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
