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

    const masterThesis = {
      ticker: stock.ticker,
      company_name: stock.company_name,
      sector: stock.sector,
      pending_promises: pending.map(p => ({
        promise: p.promise_text,
        made_in: p.made_in_quarter,
        deadline: p.target_deadline || "Not specified",
      })),
      resolved_promises: {
        kept: kept.map(p => ({
          promise: p.promise_text,
          made_in: p.made_in_quarter,
          resolved_in: p.resolved_in_quarter,
        })),
        broken: broken.map(p => ({
          promise: p.promise_text,
          made_in: p.made_in_quarter,
          resolved_in: p.resolved_in_quarter,
        })),
      },
      credibility_score: kept.length + broken.length > 0
        ? `${Math.round((kept.length / (kept.length + broken.length)) * 100)}%`
        : "No resolved promises yet",
    };

    const prompt = `You are an expert Indian equity research analyst. I need you to analyze the latest earnings call transcript and quarterly results for ${stock.company_name} (${stock.ticker}).

═══════════════════════════════════════
TRACKING DIRECTIVES (What I care about)
═══════════════════════════════════════
${stock.tracking_directives || "No specific tracking directives set. Perform a general analysis."}

${stock.investment_thesis ? `\nMY INVESTMENT THESIS: ${stock.investment_thesis}\n` : ""}
═══════════════════════════════════════
MASTER THESIS / PROMISE LEDGER (JSON)
═══════════════════════════════════════
${JSON.stringify(masterThesis, null, 2)}

═══════════════════════════════════════
YOUR OUTPUT FORMAT (Strictly follow this)
═══════════════════════════════════════
Return a SINGLE JSON object with these exact keys:

{
  "quarterly_snapshot": {
    "quarter": "Q_FY__",
    "summary": "3-5 sentence ruthless summary of the quarter",
    "dodged_questions": ["Questions management avoided or deflected"],
    "red_flags": ["Concerning data points or inconsistencies"],
    "metrics": {
      "revenue_growth": null,
      "opm": null,
      "pat_growth": null,
      "order_book": null
    }
  },
  "promise_updates": [
    {
      "promise_text": "Exact text of the existing promise",
      "new_status": "kept | broken | pending",
      "resolved_in_quarter": "Q_FY__ or null if still pending",
      "evidence": "What in the transcript/results proves this status"
    }
  ],
  "new_promises": [
    {
      "promise_text": "New commitment made by management this quarter",
      "made_in_quarter": "Q_FY__",
      "target_deadline": "FY__ or Q_FY__ or null",
      "status": "pending"
    }
  ]
}

═══════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════
1. Cross-reference EVERY pending promise from the ledger above against the transcript. Update statuses ruthlessly.
2. Extract NEW promises/commitments made this quarter.
3. Focus on the TRACKING DIRECTIVES — hunt for those specific metrics.
4. Be precise with numbers. No vague language.
5. I will now paste the transcript and quarterly results below this prompt.

---
[PASTE TRANSCRIPT AND RESULTS BELOW]
---`;

    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast({ title: "Copied to clipboard", description: "Paste into Gemini along with the transcript." });
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
