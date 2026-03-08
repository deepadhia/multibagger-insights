import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useManagementPromises, useQuarterlySnapshots } from "@/hooks/useStocks";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";

interface Props {
  stock: {
    id: string;
    ticker: string;
    company_name: string;
    tracking_directives?: string | null;
    investment_thesis?: string | null;
    sector?: string | null;
    metric_keys?: unknown;
  };
}

export function CopyGeminiPrompt({ stock }: Props) {
  const { data: promises } = useManagementPromises(stock.id);
  const { data: snapshots } = useQuarterlySnapshots(stock.id);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const pending = promises?.filter(p => p.status === "pending") || [];
    const kept = promises?.filter(p => p.status === "kept") || [];
    const broken = promises?.filter(p => p.status === "broken") || [];

    const pendingLedger = pending.map(p => ({
      id: p.id,
      promise_text: p.promise_text,
      made_in_quarter: p.made_in_quarter,
      target_deadline: p.target_deadline || "Not specified",
    }));

    const resolvedLedger = {
      kept: kept.map(p => ({
        id: p.id,
        promise_text: p.promise_text,
        made_in: p.made_in_quarter,
        resolved_in: p.resolved_in_quarter,
      })),
      broken: broken.map(p => ({
        id: p.id,
        promise_text: p.promise_text,
        made_in: p.made_in_quarter,
        resolved_in: p.resolved_in_quarter,
      })),
    };

    const credibility = kept.length + broken.length > 0
      ? `${Math.round((kept.length / (kept.length + broken.length)) * 100)}%`
      : "No resolved promises yet";

    // Build previous quarter context
    const prevQuarterContext = (() => {
      const prevSnap = snapshots?.[0];
      if (!prevSnap) return "No previous quarter data available.";
      const prevMetrics = (prevSnap.metrics && typeof prevSnap.metrics === "object") ? prevSnap.metrics as Record<string, string> : {};
      const prevFlags = Array.isArray(prevSnap.red_flags) ? prevSnap.red_flags : [];
      const prevDodged = Array.isArray(prevSnap.dodged_questions) ? prevSnap.dodged_questions : [];
      return `Previous Quarter: ${prevSnap.quarter}
Summary: ${prevSnap.summary || "N/A"}
Key Metrics: ${JSON.stringify(prevMetrics, null, 2)}
Red Flags: ${prevFlags.length > 0 ? prevFlags.join("; ") : "None"}
Dodged Questions: ${prevDodged.length > 0 ? prevDodged.join("; ") : "None"}`;
    })();

    // Build dynamic metrics schema
    const metricsSchema = JSON.stringify(
      (Array.isArray(stock.metric_keys) ? stock.metric_keys as string[] : ["revenue_growth", "opm", "pat_growth", "order_book"]).reduce(
        (acc: Record<string, string>, key: string) => {
          acc[key] = "Value (Source Quote)";
          return acc;
        },
        {} as Record<string, string>
      ),
      null,
      6
    );

    const prompt = `You are a ruthless Indian equity research analyst. Your job is to evaluate whether the investment thesis is strengthening or weakening based on earnings calls and results. Ignore macro commentary and focus on operational metrics and commitments.

═══════════════════════════════════════
TRACKING DIRECTIVES (STOCK CONTEXT)
═══════════════════════════════════════
${stock.tracking_directives || "No specific tracking directives set. Perform a general analysis focusing on revenue growth, margin trajectory, order book, and management credibility."}
${stock.investment_thesis ? `\nMY INVESTMENT THESIS: ${stock.investment_thesis}` : ""}

═══════════════════════════════════════
PREVIOUS QUARTER CONTEXT (for QoQ comparison)
═══════════════════════════════════════
${prevQuarterContext}

═══════════════════════════════════════
PENDING PROMISE LEDGER
═══════════════════════════════════════
${JSON.stringify(pendingLedger, null, 2)}

Credibility Score: ${credibility}
Resolved History: ${JSON.stringify(resolvedLedger, null, 2)}

═══════════════════════════════════════
OUTPUT FORMAT (Strict JSON)
═══════════════════════════════════════
Return a SINGLE JSON object. No prose. No markdown backticks.

{
  "thesis_status": {
    "status": "strengthening | stable | weakening | broken",
    "reason": "1-2 sentence ruthless justification based on QoQ delta and promises"
  },
  "quarterly_snapshot": {
    "quarter": "Q_FY__",
    "summary": "3-5 sentence ruthless summary of the quarter.",
    "dodged_questions": ["Summarize specific questions management avoided or deflected"],
    "red_flags": ["Concerning inconsistencies, tone shifts, or QoQ deterioration"],
    "metrics": ${metricsSchema}
  },
  "promise_updates": [
    {
      "id": "UUID from the ledger above",
      "new_status": "kept | broken | pending",
      "resolved_in_quarter": "Q_FY__ or null if still pending",
      "evidence": "Direct quote or data point proving this status"
    }
  ],
  "new_promises": [
    {
      "promise_text": "New commitment made by management this quarter",
      "made_in_quarter": "Q_FY__",
      "target_deadline": "FY__ or Q_FY__ or null"
    }
  ]
}

═══════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════
1. Compare current quarter data against the PREVIOUS QUARTER CONTEXT. Flag deterioration or improvement in the thesis_status and red_flags.
2. Cross-reference EVERY promise ID from the ledger. Update status ruthlessly with evidence.
3. THE SILENT FAILURE RULE: If a promise's target_deadline has passed in this quarter and management does not confirm completion, you MUST mark the promise as "broken" with evidence "Silent failure — deadline passed with no confirmation".
4. Since I may provide audio, pay special attention to management's tone during Q&A. Flag any hesitations, deflections, or "corporate speak" when asked about key metrics as Red Flags.
5. Hunt specifically for the metrics mentioned in the TRACKING DIRECTIVES.
6. If a metric is not explicitly disclosed in the transcript/results, write "NOT DISCLOSED" — do NOT hallucinate numbers.
7. For every metric value, include the exact source quote from the transcript in parentheses.
8. Extract ALL new forward-looking commitments as new_promises.
9. COMPARE with previous quarter: identify new growth drivers, removed drivers, tone changes, and new risks vs prior quarter.

---
[PASTE TRANSCRIPT AND/OR RESULTS BELOW]
---`;

    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast({ title: "V2 Prompt copied", description: `${stock.ticker} — ${pendingLedger.length} pending promises, QoQ context included. Paste into Gemini.` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard.", variant: "destructive" });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="font-mono text-xs"
    >
      {copied ? <Check className="h-3 w-3 text-terminal-green" /> : <Copy className="h-3 w-3" />}
      <span className="ml-1">{copied ? "Copied!" : "Gemini Prompt"}</span>
    </Button>
  );
}
