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

    // Build previous quarter context from last snapshot's raw_ai_output or fields
    const prevQuarterContext = (() => {
      const prevSnap = snapshots?.[0];
      if (!prevSnap) return "No previous quarter data available.";
      // If we have the full raw AI output, inject it for maximum context
      if (prevSnap.raw_ai_output && typeof prevSnap.raw_ai_output === "object") {
        return JSON.stringify(prevSnap.raw_ai_output, null, 2);
      }
      const prevMetrics = (prevSnap.metrics && typeof prevSnap.metrics === "object") ? prevSnap.metrics as Record<string, unknown> : {};
      const prevFlags = Array.isArray(prevSnap.red_flags) ? prevSnap.red_flags : [];
      const prevDodged = Array.isArray(prevSnap.dodged_questions) ? prevSnap.dodged_questions : [];
      return `Quarter: ${prevSnap.quarter}
Summary: ${prevSnap.summary || "N/A"}
Metrics: ${JSON.stringify(prevMetrics, null, 2)}
Red Flags: ${prevFlags.length > 0 ? prevFlags.join("; ") : "None"}
Dodged Questions: ${prevDodged.length > 0 ? prevDodged.join("; ") : "None"}`;
    })();

    // Build dynamic metrics schema with { value, evidence } structure
    const metricKeys = Array.isArray(stock.metric_keys)
      ? stock.metric_keys as string[]
      : ["revenue_growth", "opm", "pat_growth", "order_book"];

    const metricsSchema = metricKeys.reduce(
      (acc: Record<string, { value: string; evidence: string }>, key: string) => {
        acc[key] = { value: "", evidence: "" };
        return acc;
      },
      {} as Record<string, { value: string; evidence: string }>
    );

    const prompt = `You are a ruthless Indian equity research analyst. Your job is to evaluate whether the investment thesis is strengthening or weakening based on earnings calls and results. Ignore macro commentary and focus on operational metrics and commitments.

═══════════════════════════════════════
TRACKING DIRECTIVES (STOCK CONTEXT)
═══════════════════════════════════════
${stock.tracking_directives || "No specific tracking directives set. Perform a general analysis focusing on revenue growth, margin trajectory, order book, and management credibility."}
${stock.investment_thesis ? `\nMY INVESTMENT THESIS: ${stock.investment_thesis}` : ""}

═══════════════════════════════════════
PREVIOUS QUARTER CONTEXT
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
Return a SINGLE JSON object exactly matching this schema. No prose. No markdown backticks.

{
  "quarter": "Q_FY__",
  "snapshot": {
    "summary": "3-5 sentence ruthless summary of the quarter.",
    "management_tone": "bullish | neutral | cautious",
    "thesis_status": "strengthening | stable | weakening | broken",
    "confidence_score": 0-100,
    "key_changes_vs_last_quarter": [
      "Crucial operational or narrative shifts compared to the previous quarter context"
    ]
  },
  "metrics": ${JSON.stringify(metricsSchema, null, 4)},
  "signals": {
    "bullish": ["Positive demand, margin, or execution indicators"],
    "warnings": ["Potential headwinds or execution delays"],
    "bearish": ["Severe deterioration or structural thesis breaks"]
  },
  "management_analysis": {
    "dodged_questions": ["Specific questions management avoided or deflected in Q&A"],
    "red_flags": ["Concerning inconsistencies or tone shifts"]
  },
  "promise_updates": [
    {
      "id": "UUID from the ledger above",
      "status": "kept | broken | pending",
      "resolved_quarter": "Q_FY__ or null",
      "evidence": "Direct quote proving this status"
    }
  ],
  "new_promises": [
    {
      "promise_text": "New commitment made by management this quarter",
      "target_deadline": "FY__ or Q_FY__ or null",
      "confidence": "high | medium | low"
    }
  ]
}

═══════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════
1. Compare current quarter data against the PREVIOUS QUARTER CONTEXT. Populate the key_changes_vs_last_quarter and adjust the thesis_status accordingly.
2. Cross-reference EVERY promise ID from the ledger. Update status ruthlessly with evidence.
3. THE SILENT FAILURE RULE: If a promise's target_deadline has passed in this quarter and management does not confirm completion, you MUST mark the promise status as "broken" with evidence "Silent failure — deadline passed with no confirmation".
4. Never combine value and evidence in the same field. If a metric is not explicitly disclosed in the transcript or results, set the value to "NOT DISCLOSED" and do not hallucinate numbers.
5. Provide exact source quotes for every piece of evidence.
6. Extract ALL new forward-looking commitments as new_promises and assign a confidence score based on management's historical track record and tone.
7. Pay special attention to management's tone during Q&A. Flag any hesitations, deflections, or "corporate speak" in management_analysis.red_flags.

---
[PASTE TRANSCRIPT AND/OR RESULTS BELOW]
---`;

    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast({ title: "V3 Prompt copied", description: `${stock.ticker} — ${pendingLedger.length} pending promises, nested metrics schema. Paste into Gemini.` });
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
