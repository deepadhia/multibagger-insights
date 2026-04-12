import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useManagementPromises, useQuarterlySnapshots, useStockTrackingProfile } from "@/hooks/useStocks";
import { decisionRulesFromProfile, getMetricKeysForPrompt } from "@/lib/trackingProfileConfig";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Braces } from "lucide-react";

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

type CopyKind = "prompt" | "json" | null;

function buildGeminiContext(
  stock: Props["stock"],
  promises: Array<{
    id: string;
    promise_text: string;
    made_in_quarter: string | null;
    target_deadline: string | null;
    status: string;
  }> | undefined,
  snapshots: unknown[] | undefined,
  trackingConfig: Record<string, unknown> | null,
) {
  const pending = promises?.filter((p) => p.status === "pending") || [];
  const kept = promises?.filter((p) => p.status === "kept") || [];
  const broken = promises?.filter((p) => p.status === "broken") || [];

  const pendingLedger = pending.map((p) => ({
    id: p.id,
    promise_text: p.promise_text,
    made_in_quarter: p.made_in_quarter,
    target_deadline: p.target_deadline || "Not specified",
  }));

  const credibility =
    kept.length + broken.length > 0
      ? `${Math.round((kept.length / (kept.length + broken.length)) * 100)}%`
      : "No resolved promises yet";

  const rollingSnapshotsArray = (() => {
    if (!snapshots || snapshots.length === 0) return [];
    return snapshots.slice(0, 4).map((s) => {
      const snapAny = s as Record<string, unknown>;
      if (snapAny.raw_ai_output && typeof snapAny.raw_ai_output === "object") return snapAny.raw_ai_output;
      const prevMetrics = snapAny.metrics && typeof snapAny.metrics === "object" ? snapAny.metrics : {};
      return {
        quarter: snapAny.quarter,
        snapshot: {
          summary: snapAny.summary ?? null,
          thesis_status: snapAny.thesis_status ?? null,
          thesis_drift: snapAny.thesis_drift_status
            ? { status: snapAny.thesis_drift_status, reason: snapAny.thesis_drift_reason ?? null }
            : null,
        },
        metrics: prevMetrics,
        management_analysis: {
          red_flags: Array.isArray(snapAny.red_flags) ? snapAny.red_flags : [],
          dodged_questions: Array.isArray(snapAny.dodged_questions) ? snapAny.dodged_questions : [],
        },
      };
    });
  })();

  const rollingSnapshots = JSON.stringify(rollingSnapshotsArray, null, 2);

  const profile = trackingConfig;

  const metricKeys = getMetricKeysForPrompt(profile as Record<string, unknown> | null | undefined, stock.metric_keys);

  const metricsSchema = {
    revenue_growth: { value: "", evidence: "" },
    opm: { value: "", evidence: "" },
    pat_growth: { value: "", evidence: "" },
    primary_thesis_metric: { value: "", evidence: "", metric_name: "" },
  } as Record<string, { value: string; evidence: string; metric_name?: string }>;

  for (const key of metricKeys) {
    if (!metricsSchema[key]) {
      metricsSchema[key] = { value: "", evidence: "" };
    }
  }

  const mandatoryMetricsReadable =
    metricKeys.length > 0
      ? metricKeys
          .map((k) => k.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()))
          .join(", ")
      : "Revenue growth, Operating margin, PAT growth";

  const primaryMetricKey =
    (profile && typeof profile.primary_thesis_metric === "object"
      ? (profile.primary_thesis_metric as Record<string, unknown>).key
      : null) ||
    metricKeys[0] ||
    "primary_thesis_metric";
  const primaryMetricLabel =
    (profile && typeof profile.primary_thesis_metric === "object"
      ? String((profile.primary_thesis_metric as Record<string, unknown>).label || "")
      : "") ||
    String(primaryMetricKey)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  metricsSchema.primary_thesis_metric.metric_name = primaryMetricLabel;

  const coreThesis =
    profile?.core_thesis ||
    stock.investment_thesis ||
    "No explicit written thesis stored. Treat this as a generic compounding story and infer the core drivers from historical AI snapshots and financials.";

  const trackingDirectives =
    profile?.tracking_directives ||
    stock.tracking_directives ||
    "Track revenue growth, margin trajectory, free cash flow, customer/segment concentration, and balance sheet risk.";

  const decisionRules = decisionRulesFromProfile(profile as Record<string, unknown> | null | undefined);
  const reviewFrequencyLine =
    decisionRules.review_frequency ||
    "quarterly (default — align with your own review calendar if different)";
  const killSwitchLines =
    decisionRules.kill_switches.length > 0
      ? decisionRules.kill_switches
          .map((c, i) => `${i + 1}. [${c.severity.toUpperCase()}] ${c.rule}`)
          .join("\n")
      : "(None configured.) Add \"kill_switch_conditions\" (string[] or { rule, severity: high|medium }[]) — fatal vs warning de-risk triggers.";
  const addOnLines =
    decisionRules.add_conditions.length > 0
      ? decisionRules.add_conditions
          .map((c, i) => `${i + 1}. [${c.severity.toUpperCase()}] ${c.rule}`)
          .join("\n")
      : "(None configured.) Add \"add_on_conditions\" for explicit upgrade / higher-conviction triggers (default severity medium).";
  const hasExplicitRules =
    decisionRules.kill_switches.length > 0 || decisionRules.add_conditions.length > 0;

  const strictRuleCheckSchema = `  "strict_rule_check": {
    "no_explicit_rules": ${!hasExplicitRules},
    "review_frequency_acknowledged": ${JSON.stringify(reviewFrequencyLine)},
    "overall_status": "pass | warning | fail",
    "overall_status_rationale": "One sentence: how kill_switches and add_conditions aggregate (see mandate below)",
    "kill_switches": [
      {
        "condition": "Exact rule text including [HIGH]/[MEDIUM] from this prompt",
        "severity": "high | medium",
        "status": "triggered | not_triggered | insufficient_data",
        "evidence": "Verbatim excerpt from transcript/presentation, or state what was NOT DISCLOSED"
      }
    ],
    "add_conditions": [
      {
        "condition": "Exact rule text from the Add conditions list",
        "severity": "high | medium",
        "status": "triggered | not_triggered | insufficient_data",
        "evidence": "Verbatim excerpt from transcript/presentation, or state what was NOT DISCLOSED"
      }
    ]
  },`;

  const verificationPayload = {
    generated_at: new Date().toISOString(),
    ticker: stock.ticker,
    company_name: stock.company_name,
    sector: stock.sector ?? null,
    core_investment_thesis: coreThesis,
    tracking_directives: trackingDirectives,
    mandatory_metric_keys: metricKeys,
    mandatory_metrics_readable: mandatoryMetricsReadable,
    primary_thesis_metric_key: primaryMetricKey,
    primary_thesis_metric_label: primaryMetricLabel,
    metrics_schema_template: metricsSchema,
    historical_snapshots_rolling: rollingSnapshotsArray,
    pending_promises_ledger: pendingLedger,
    promise_credibility_summary: credibility,
    promise_counts: {
      pending: pending.length,
      kept: kept.length,
      broken: broken.length,
    },
    decision_rules: {
      review_frequency: decisionRules.review_frequency,
      kill_switches: decisionRules.kill_switches,
      add_conditions: decisionRules.add_conditions,
    },
    stock_tracking_profile_config: profile ?? null,
  };

  const prompt = `**System Role:** You are a Lead Indian Equity Research Analyst. Your mandate is to evaluate whether the core investment thesis for the provided company is strengthening, evolving, or breaking based purely on their latest earnings call transcripts and presentations.

**Objective:** Deliver a ruthless, objective, and mathematically grounded assessment. Strip away management optimism, generic macroeconomic commentary, and empty buzzwords. Focus strictly on operational execution, capital allocation, concentration risks, and margin sustainability.

═══════════════════════════════════════
PARAMETERIZED INPUTS
═══════════════════════════════════════
**COMPANY TICKER:** ${stock.ticker}

**CORE INVESTMENT THESIS:** ${coreThesis}

**TRACKING DIRECTIVES (BASELINE THESIS):** ${trackingDirectives}

**MANDATORY METRICS TO TRACK:** ${mandatoryMetricsReadable}

**PRIMARY THESIS METRIC TO EXTRACT:** ${primaryMetricLabel}

═══════════════════════════════════════
STRICT RULE CHECK (MANDATORY — DO NOT SKIP)
═══════════════════════════════════════
**Review frequency:** ${reviewFrequencyLine}

**Kill switch conditions** (thesis break / de-risk — evaluate against this quarter's materials + rolling context):
${killSwitchLines}

**Add / higher-conviction conditions** (when you would increase sizing or conviction):
${addOnLines}

**MANDATE:**
- For **every** configured line item above (numbered), you MUST emit one row in \`strict_rule_check.kill_switches\` or \`strict_rule_check.add_conditions\` with the **same rule text** (include the [HIGH]/[MEDIUM] tag in \`condition\`), matching \`severity\`, \`status\` = triggered | not_triggered | insufficient_data, and \`evidence\`.
- Set \`strict_rule_check.overall_status\`: **fail** if any **kill_switch** with \`severity\` **high** has \`status\` **triggered**; else **warning** if any **kill_switch** with \`severity\` **medium** has \`status\` **triggered**, OR if more than half of all kill+add rule rows are **insufficient_data** (rule-testing blind spot); else **pass**. Add_conditions being **triggered** is usually positive — do not by itself set **fail**. Explain briefly in \`overall_status_rationale\`.
- **Consequence binding (configured kill switches only):** If any **high**-severity kill_switch is **triggered**, you MUST set \`actionable_verdict.decision\` to **CUT POSITION** unless \`action_rationale\` cites **strong counter-evidence** (verbatim) proving the rule is not breached — this exception must be rare and explicit. If any **medium**-severity kill_switch is **triggered**, you MUST **NOT** output **BUILD POSITION**; use **WAIT AND WATCH** or **CUT POSITION** and explain.
- If **no** explicit rules are configured, set \`strict_rule_check.no_explicit_rules\` to true, \`overall_status\` to **pass**, use **empty arrays** for kill_switches and add_conditions, and in \`actionable_verdict.action_rationale\` you MUST still name **one** concrete scenario that would **invalidate** the thesis and **one** that would **materially strengthen** it (measurable where possible).
- Use \`insufficient_data\` when the transcript does not allow a fair test; say what is missing in \`evidence\`.

═══════════════════════════════════════
HISTORICAL CONTEXT (ROLLING YTD LEDGER)
═══════════════════════════════════════
Use this as your memory of how the thesis and execution have evolved so far. Each entry is a prior quarter's AI snapshot and metrics for ${stock.ticker}.

${rollingSnapshots}

Also use this PROMISE LEDGER to track management commitments across time:

- PENDING PROMISES (open commitments that still need tracking):
${JSON.stringify(pendingLedger, null, 2)}

Credibility Score (kept vs broken promises so far): ${credibility}

═══════════════════════════════════════
OUTPUT FORMAT (Strict JSON)
═══════════════════════════════════════
Return a SINGLE JSON object exactly matching this schema. No prose. No markdown backticks.

{
  "ticker": "${stock.ticker}",
  "quarter": "Q_FY__",
  "snapshot": {
    "summary": "3-5 sentence objective summary of the quarter focusing on aggregate financial health and thesis alignment.",
    "management_tone": "bullish | neutral | cautious",
    "thesis_status": "strengthening | stable | weakening | broken",
    "thesis_momentum": "improving | stable | deteriorating",
    "thesis_drift": {
      "status": "none | evolving | confirmed_break",
      "reason": "Explain if the company is pivoting intelligently into adjacent high-margin areas (evolving) or abandoning its core profit drivers (break)."
    },
    "confidence_score": 0,
    "key_changes_vs_last_quarter": [
      "Crucial operational or narrative shifts compared to the previous quarter context"
    ]
  },
  "metrics": ${JSON.stringify(metricsSchema, null, 4)},
${strictRuleCheckSchema}
  "signals": {
    "bullish": ["Positive demand, margin, or execution indicators tied to the thesis"],
    "warnings": ["Identify customer/geo concentration (>25% from 1-2 sources), RM inflation, pricing pressure, or delayed timelines"],
    "bearish": ["Severe deterioration or structural thesis breaks"]
  },
  "management_analysis": {
    "dodged_questions_or_omissions": ["Specific metrics or historical segments management stopped reporting this quarter"],
    "red_flags": ["List specific structural risks. If no red flags are identified in the text, you MUST return an empty array []"]
  },
  "actionable_verdict": {
    "decision": "BUILD POSITION | WAIT AND WATCH | CUT POSITION",
    "conviction_level": "HIGH | MEDIUM | LOW",
    "action_rationale": "2-3 ruthless sentences explaining exactly WHY you should take this action. If 'Wait', define the specific trigger you are waiting for. If 'Build', explain why the risk/reward is currently asymmetric."
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
      "promise_text": "New quantitative commitment",
      "target_deadline": "FY__ or Q_FY__",
      "confidence": "high | medium | low"
    }
  ]
}

═══════════════════════════════════════
ANTI-BIAS & ANTI-HALLUCINATION PROTOCOLS
═══════════════════════════════════════

1. THE AGGREGATE TRUTH RULE (Anti-Bias): Financial gravity supersedes specific product narratives. If Revenue, OPM (Operating Profit Margin), and PAT are all growing strongly YoY, you CANNOT mark the thesis as "broken" or assign a confidence score below 65. Strong financials indicate the business is succeeding, even if they are doing it through adjacent products.
2. SEMANTIC FLEXIBILITY (Thesis Evolution): Do not act like a keyword scraper. If a company stops reporting a specific legacy product but shows massive growth in adjacent premium segments, the thesis is EVOLVING, not broken. Recognize business model maturation.
3. THE NULL-VALUE MANDATE (Anti-Hallucination): If a specific metric is not explicitly stated in the text, you MUST output "NOT DISCLOSED" for the value. Do not calculate it yourself. Do not guess. Log this omission in management_analysis.dodged_questions_or_omissions.
4. CONTEXTUAL CAPEX EVALUATION: High CAPEX is not inherently bad. If management raises CAPEX guidance while simultaneously accelerating revenue and generating free cash flow, treat this as a BULLISH growth signal. Only flag CAPEX as a red_flag if it is funded by spiking debt while margins contract.
5. EVIDENCE INTEGRITY: Every string placed in an "evidence" field MUST be a verbatim excerpt from the provided text. Never mix your own words with the evidence string.
6. SILENT FAILURE DETECTION: Cross-reference EVERY promise ID from the PENDING PROMISE LEDGER provided in this prompt. If a target deadline has arrived and the text does not confirm its completion, mark it "broken" with the evidence: "Silent failure - deadline passed without management confirmation."
7. THE ACTIONABLE VERDICT PROTOCOL:
   - BUILD POSITION: Only recommend this if the thesis is strengthening, margins are expanding, and execution is flawless. Conviction must be HIGH — and **no** configured kill_switch row may be **triggered** (see STRICT RULE CHECK mandate).
   - WAIT AND WATCH: Recommend this if the thesis is evolving, if there are short-term headwinds (e.g., temporary margin compression), if customer concentration risk is exceptionally high, or if a **medium** kill_switch triggered. Clearly state what metric must be resolved to upgrade to a "Build."
   - CUT POSITION: Use for confirmed structural thesis break **or** when a **high**-severity kill_switch is **triggered** per the STRICT RULE CHECK mandate (unless rare counter-evidence exception is documented in action_rationale).
8. NEVER hallucinate numbers. If you cannot find a value explicitly in the transcript/presentation, set the metric value to "NOT DISCLOSED" and record that omission in management_analysis.dodged_questions_or_omissions.
9. STRICT PROMISE REFERENCING: When updating promises in the promise_updates array, you MAY ONLY use IDs that are explicitly listed in the PENDING PROMISE LEDGER provided in this prompt. Do not invent, recall, or hallucinate UUIDs.
10. NEW PROMISE ISOLATION: Do not assign IDs to new_promises. Only extract promise_text, target_deadline, and confidence.
11. NO GHOST UPDATES: If you cannot find evidence regarding a pending promise in the current quarter, keep it as "pending". Do not assume it is broken unless the text confirms failure after the deadline.
12. FIELD PURITY: Never use negative fields (like \`red_flags\` or \`warnings\`) to host positive data, praise, or justifications for a lack of risk. If the quarter is clean, return an empty array []. Do not explain the absence of a risk within the risk field itself.
13. STRICT RULE CHECK COMPLETION: You MUST include a populated \`strict_rule_check\` object. Never omit it. Every configured kill-switch and add condition from the STRICT RULE CHECK section must appear exactly once with a verdict; do not silently skip rules.
14. INSUFFICIENT DATA ESCALATION: Count all rows in \`strict_rule_check.kill_switches\` and \`strict_rule_check.add_conditions\` (excluding when \`no_explicit_rules\` is true). If **more than 50%** of those rows have \`status\` **insufficient_data**, you MUST append an entry to \`management_analysis.red_flags\` stating that the quarter could not test most configured rules and portfolio review is blind on those checks until disclosures improve (one clear sentence).
15. KILL SWITCH VS AGGREGATE TRUTH: If protocol (1) would suggest strong financials but a **high** kill_switch is **triggered**, you must still follow the STRICT RULE CHECK consequence binding; resolve the tension explicitly in \`action_rationale\` (rule breach vs headline numbers) — do not silently ignore the triggered rule.`;

  return { prompt, verificationPayload };
}

export function CopyGeminiPrompt({ stock }: Props) {
  const { data: promises } = useManagementPromises(stock.id);
  const { data: snapshots } = useQuarterlySnapshots(stock.id);
  const { data: trackingConfig } = useStockTrackingProfile(stock.id);
  const { toast } = useToast();
  const [copiedKind, setCopiedKind] = useState<CopyKind>(null);

  const copyPrompt = async () => {
    const { prompt } = buildGeminiContext(stock, promises, snapshots, (trackingConfig as Record<string, unknown> | null) ?? null);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedKind("prompt");
      toast({
        title: "Prompt copied",
        description: `${stock.ticker} — full V4 prompt ready to paste into Gemini.`,
      });
      setTimeout(() => setCopiedKind((k) => (k === "prompt" ? null : k)), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard.", variant: "destructive" });
    }
  };

  const copyJson = async () => {
    const { verificationPayload } = buildGeminiContext(
      stock,
      promises,
      snapshots,
      (trackingConfig as Record<string, unknown> | null) ?? null,
    );
    try {
      await navigator.clipboard.writeText(JSON.stringify(verificationPayload, null, 2));
      setCopiedKind("json");
      toast({
        title: "JSON copied",
        description: `${stock.ticker} — structured context (thesis, ledger, rolling snapshots) for verification.`,
      });
      setTimeout(() => setCopiedKind((k) => (k === "json" ? null : k)), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard.", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={copyPrompt} className="font-mono text-xs">
        {copiedKind === "prompt" ? (
          <Check className="h-3 w-3 text-terminal-green" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        <span className="ml-1">{copiedKind === "prompt" ? "Copied!" : "Copy prompt"}</span>
      </Button>
      <Button variant="outline" size="sm" onClick={copyJson} className="font-mono text-xs border-border">
        {copiedKind === "json" ? (
          <Check className="h-3 w-3 text-terminal-green" />
        ) : (
          <Braces className="h-3 w-3" />
        )}
        <span className="ml-1">{copiedKind === "json" ? "Copied!" : "Copy JSON"}</span>
      </Button>
    </div>
  );
}
