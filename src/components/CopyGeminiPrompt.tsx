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

    // Build previous quarter context from last snapshot
    const prevQuarterContext = (() => {
      const prevSnap = snapshots?.[0];
      if (!prevSnap) return "No previous quarter data available.";
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

    const prompt = `You are a ruthless Indian equity research analyst. Your job is to evaluate whether the investment thesis is strengthening or weakening based on earnings calls and results.

Focus strictly on operational execution, not management optimism. If claims about demand, margins, or commercialization are made without supporting numbers, treat them as low-confidence signals and ignore generic macroeconomic fluff.

═══════════════════════════════════════
TRACKING DIRECTIVES (BASELINE THESIS)
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
  "ticker": "${stock.ticker}",
  "quarter": "Q_FY__",
  "snapshot": {
    "summary": "3-5 sentence ruthless summary of the quarter.",
    "management_tone": "bullish | neutral | cautious",
    "thesis_status": "strengthening | stable | weakening | broken",
    "thesis_momentum": "improving | stable | deteriorating",
    "thesis_drift": {
      "status": "none | emerging | confirmed",
      "reason": "Identify any metric, timeline, narrative, or capital allocation drift away from the baseline thesis."
    },
    "confidence_score": 0,
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
1. THESIS DRIFT DETECTOR: Actively compare current execution against the BASELINE THESIS. Flag "emerging" drift if timelines slip, capital is misallocated, or management shifts focus away from thesis drivers. Flag "confirmed" drift if structural drivers are abandoned. Otherwise, "none".
2. Compare current quarter data against the PREVIOUS QUARTER CONTEXT. Populate the key_changes_vs_last_quarter array. Detect language shifts (e.g., "strong demand" → "stable demand") and log them in red_flags if sentiment deteriorates.
3. Cross-reference EVERY promise ID from the ledger. Update status ruthlessly with evidence.
4. THE SILENT FAILURE RULE: If the target_deadline occurs in or before the current quarter and the transcript/results do not confirm completion, you MUST mark the promise as "broken" with evidence "Silent failure — deadline passed with no confirmation". If management explicitly delays the timeline, mark it as "broken" and note the revised timeline in evidence.
5. Metrics listed in the TRACKING DIRECTIVES are mandatory. If management avoids disclosing them, set the value to "NOT DISCLOSED" and add a note in red_flags. Never combine value and evidence in the same field, and do not hallucinate numbers.
6. Flag execution risk in signals.warnings or red_flags if commercialization timelines, approvals, or capex schedules are delayed compared to previous quarters.
7. Evidence quotes MUST be verbatim excerpts from the transcript or presentation. If no supporting quote exists, return "NOT DISCLOSED".
8. Calculate the confidence_score (0-100) reflecting overall thesis conviction:
   - 80–100: Thesis strengthening with clear operational execution.
   - 60–79: Thesis intact but execution still pending.
   - 40–59: Increasing uncertainty or delayed milestones.
   - < 40: Thesis deterioration or broken commitments.
9. Extract ALL new forward-looking commitments as new_promises and assign a confidence tier based on management's historical track record and tone.

---
[PASTE TRANSCRIPT AND/OR RESULTS BELOW]
---`;

    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast({ title: "V5 Prompt copied", description: `${stock.ticker} — ${pendingLedger.length} pending promises, thesis drift detector enabled. Paste into Gemini.` });
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
