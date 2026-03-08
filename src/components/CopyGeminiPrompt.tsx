import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useManagementPromises } from "@/hooks/useStocks";
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
  };
}

export function CopyGeminiPrompt({ stock }: Props) {
  const { data: promises } = useManagementPromises(stock.id);
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

    const prompt = `You are a ruthless Indian equity research analyst. Analyze the provided earnings call (audio/transcript) and quarterly results for ${stock.company_name} (${stock.ticker}).

═══════════════════════════════════════
TRACKING DIRECTIVES
═══════════════════════════════════════
${stock.tracking_directives || "No specific tracking directives set. Perform a general analysis focusing on revenue growth, margin trajectory, order book, and management credibility."}
${stock.investment_thesis ? `\nMY INVESTMENT THESIS: ${stock.investment_thesis}` : ""}

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
  "quarterly_snapshot": {
    "quarter": "Q_FY__",
    "summary": "3-5 sentence ruthless summary of the quarter.",
    "dodged_questions": ["Summarize specific questions management avoided or deflected"],
    "red_flags": ["Concerning inconsistencies, tone shifts, or data points"],
    "metrics": {
      "revenue_growth": "Value (Source Quote)",
      "opm": "Value (Source Quote)",
      "pat_growth": "Value (Source Quote)",
      "vap_ebitda_margin": "Value (Source Quote)",
      "vap_revenue_share": "Value (Source Quote)",
      "type4_cylinder_status": "Value (Source Quote)",
      "net_debt": "Value (Source Quote)",
      "order_book": "Value (Source Quote)"
    }
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
1. Cross-reference EVERY promise ID from the ledger. Update status ruthlessly with evidence.
2. Since I may provide audio, pay special attention to management's tone during Q&A. Flag any hesitations, deflections, or "corporate speak" when asked about key metrics as Red Flags.
3. Hunt specifically for the metrics mentioned in the TRACKING DIRECTIVES.
4. If a metric is not disclosed in the transcript/results, write "NOT DISCLOSED" — do NOT hallucinate numbers.
5. For every metric value, include the exact source quote from the transcript in parentheses.
6. Extract ALL new forward-looking commitments as new_promises.

---
[PASTE TRANSCRIPT AND/OR RESULTS BELOW]
---`;

    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast({ title: "Copied to clipboard", description: `Prompt for ${stock.ticker} with ${pendingLedger.length} pending promises. Paste into Gemini.` });
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
