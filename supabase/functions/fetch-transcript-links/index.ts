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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, company_name, screener_slug } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    type LinkItem = {
      title: string;
      date: string;
      source: string;
      url: string;
      type: string;
    };

    const transcripts: LinkItem[] = [];
    const orderAnnouncements: LinkItem[] = [];

    // Keywords that indicate the filing is NOT a transcript
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

    // Keywords for new order wins
    const ORDER_KEYWORDS = [
      "new order", "order win", "order received", "order bagged",
      "contract awarded", "letter of intent", "loi received",
      "work order", "purchase order", "order book",
    ];

    // === SOURCE 1: BSE Corporate Announcements ===
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 1);

    const bseSearchTerms = [ticker];
    if (company_name) {
      // Use first word of company name for broader search
      const firstWord = company_name.split(/\s+/)[0];
      if (firstWord.length > 2 && firstWord.toUpperCase() !== ticker.toUpperCase()) {
        bseSearchTerms.push(firstWord);
      }
    }

    for (const searchTerm of bseSearchTerms) {
      try {
        // BSE Announcement search - look for concall/transcript related filings
        const bseUrl = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=Result&strPrevDate=${formatDate(fromDate)}&strScrip=${encodeURIComponent(searchTerm)}&strSearch=P&strToDate=${formatDate(toDate)}&strType=C`;

        console.log(`Searching BSE for: ${searchTerm}`);
        const bseResp = await fetch(bseUrl, { headers: BSE_HEADERS });

        if (bseResp.ok) {
          const data = await bseResp.json();
          const table = data?.Table || [];
          console.log(`BSE returned ${table.length} results for ${searchTerm}`);

          for (const item of table) {
            const headline = (item.NEWSSUB || "").toLowerCase();
            const attachUrl = item.ATTACHMENTNAME || "";

            const newsDate = item.NEWS_DT || item.DT_TM || "";
            let dateStr = "";
            try {
              const d = new Date(newsDate);
              if (!isNaN(d.getTime())) dateStr = d.toISOString().split("T")[0];
            } catch { /* skip */ }

            const buildLink = (title: string, type: string): LinkItem => ({
              title: title || "Filing",
              date: dateStr,
              source: "BSE",
              url: attachUrl.startsWith("http") ? attachUrl : `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${attachUrl}`,
              type,
            });

            // Check for new order announcements
            if (ORDER_KEYWORDS.some(k => headline.includes(k))) {
              orderAnnouncements.push(buildLink(item.NEWSSUB || "New Order", "order"));
              continue;
            }

            // Filter for transcript/concall related filings
            const isTranscript =
              headline.includes("transcript") ||
              headline.includes("concall") ||
              headline.includes("con call") ||
              headline.includes("conference call") ||
              headline.includes("earnings call") ||
              headline.includes("analyst meet") ||
              headline.includes("investor presentation");

            if (!isTranscript) continue;

            // Exclude intimations & generic notices
            const isExcluded = EXCLUDE_KEYWORDS.some(k => headline.includes(k));
            if (isExcluded && !headline.includes("transcript")) continue;

            transcripts.push(buildLink(
              item.NEWSSUB || "Transcript",
              headline.includes("presentation") ? "presentation" : "transcript",
            ));
          }
        } else {
          console.log(`BSE search failed for ${searchTerm}: ${bseResp.status}`);
        }
      } catch (e) {
        console.error(`BSE error for ${searchTerm}:`, e);
      }
    }

    // === SOURCE 2: Screener.in (scrape document links) ===
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

          // Extract concall/transcript links from the documents section
          // Screener typically has links like: <a href="...">Concall Transcript Q3 FY26</a>
          const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]*(?:transcript|concall|con call|conference call|earnings call|investor presentation)[^<]*)<\/a>/gi;
          let match;
          while ((match = linkPattern.exec(html)) !== null) {
            const url = match[1];
            const title = match[2].trim();
            if (url && title) {
              transcripts.push({
                title,
                date: "",
                source: "Screener",
                url: url.startsWith("http") ? url : `https://www.screener.in${url}`,
                type: title.toLowerCase().includes("presentation") ? "presentation" : "transcript",
              });
            }
          }

          // Also look for document links in the "Documents" section
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
                transcripts.push({
                  title: dlMatch[2].trim(),
                  date: "",
                  source: "Screener",
                  url: url.startsWith("http") ? url : `https://www.screener.in${url}`,
                  type: "transcript",
                });
              }
            }
          }

          console.log(`Found ${transcripts.filter(t => t.source === "Screener").length} links from Screener`);
        } else {
          const body = await resp.text();
          console.log(`Screener fetch failed: ${resp.status}`);
        }
      } catch (e) {
        console.error("Screener error:", e);
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = transcripts.filter(t => {
      if (seen.has(t.url)) return false;
      seen.add(t.url);
      return true;
    });

    // Sort by date descending
    unique.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // Deduplicate orders
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
