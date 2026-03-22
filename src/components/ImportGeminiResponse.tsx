import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, Check, AlertTriangle } from "lucide-react";

interface Props {
  stockId: string;
  ticker: string;
}

// V5/V4 response format (current)
interface GeminiV5Response {
  ticker?: string;
  quarter: string;
  snapshot: {
    summary: string;
    management_tone: "bullish" | "neutral" | "cautious";
    thesis_status: "strengthening" | "stable" | "weakening" | "broken";
    thesis_momentum?: "improving" | "stable" | "deteriorating";
    thesis_drift?: {
      // Support older "emerging|confirmed" and newer "evolving|confirmed_break"
      status: "none" | "emerging" | "confirmed" | "evolving" | "confirmed_break";
      reason?: string;
    };
    confidence_score: number;
    key_changes_vs_last_quarter?: string[];
  };
  metrics: Record<string, { value: string; evidence: string }>;
  signals?: {
    bullish?: string[];
    warnings?: string[];
    bearish?: string[];
  };
  management_analysis?: {
    // Newer V4-style field name
    dodged_questions_or_omissions?: string[];
    // Older name kept for backwards compatibility
    dodged_questions?: string[];
    red_flags?: string[];
  };
  actionable_verdict?: {
    decision: string;
    conviction_level: string;
    action_rationale: string;
  };
  promise_updates?: {
    id: string;
    status: "kept" | "broken" | "pending";
    resolved_quarter?: string | null;
    evidence?: string;
  }[];
  new_promises?: {
    promise_text: string;
    target_deadline?: string | null;
    confidence?: "high" | "medium" | "low";
  }[];
}

// V2 legacy format
interface GeminiV2Response {
  thesis_status?: { status: string; reason: string };
  quarterly_snapshot: {
    quarter: string;
    summary: string;
    dodged_questions?: string[];
    red_flags?: string[];
    metrics?: Record<string, string>;
  };
  promise_updates?: {
    id: string;
    new_status: "kept" | "broken" | "pending";
    resolved_in_quarter?: string | null;
    evidence?: string;
  }[];
  new_promises?: {
    promise_text: string;
    made_in_quarter: string;
    target_deadline?: string | null;
  }[];
}

interface NormalizedData {
  quarter: string;
  summary: string;
  thesis_status: string | null;
  thesis_status_reason: string | null;
  thesis_momentum: string | null;
  thesis_drift_status: string | null;
  thesis_drift_reason: string | null;
  confidence_score: number | null;
  management_tone: string | null;
  dodged_questions: string[];
  red_flags: string[];
  metrics: Record<string, unknown>;
  signals: { bullish: string[]; warnings: string[]; bearish: string[] } | null;
  key_changes: string[];
  promise_updates: { id: string; new_status: string; resolved_in_quarter: string | null; evidence?: string }[];
  new_promises: { promise_text: string; made_in_quarter: string; target_deadline: string | null; confidence?: string }[];
  action_decision: string | null;
  action_conviction: string | null;
  action_rationale: string | null;
  raw: unknown;
}

function isV5(data: any): data is GeminiV5Response {
  return data.snapshot && data.metrics && typeof data.quarter === "string";
}

function normalize(data: any, fallbackQuarter: string): NormalizedData {
  if (isV5(data)) {
    const v = data as GeminiV5Response;
    const management = v.management_analysis || {};
    const driftStatus = v.snapshot.thesis_drift?.status || null;
    const mappedDriftStatus =
      driftStatus === "confirmed_break"
        ? "confirmed_break"
        : driftStatus === "evolving"
          ? "evolving"
          : driftStatus;

    return {
      quarter: v.quarter || fallbackQuarter,
      summary: v.snapshot.summary,
      thesis_status: v.snapshot.thesis_status,
      thesis_status_reason: v.snapshot.key_changes_vs_last_quarter?.join("; ") || v.snapshot.thesis_drift?.reason || null,
      thesis_momentum: v.snapshot.thesis_momentum || null,
      thesis_drift_status: mappedDriftStatus,
      thesis_drift_reason: v.snapshot.thesis_drift?.reason || null,
      confidence_score: v.snapshot.confidence_score,
      management_tone: v.snapshot.management_tone,
      dodged_questions:
        management.dodged_questions_or_omissions ||
        management.dodged_questions ||
        [],
      red_flags: management.red_flags || [],
      metrics: v.metrics,
      signals: v.signals ? {
        bullish: v.signals.bullish || [],
        warnings: v.signals.warnings || [],
        bearish: v.signals.bearish || [],
      } : null,
      key_changes: v.snapshot.key_changes_vs_last_quarter || [],
      promise_updates: (v.promise_updates || []).map(p => ({
        id: p.id,
        new_status: p.status,
        resolved_in_quarter: p.resolved_quarter || null,
        evidence: p.evidence,
      })),
      new_promises: (v.new_promises || []).map(p => ({
        promise_text: p.promise_text,
        made_in_quarter: v.quarter || fallbackQuarter,
        target_deadline: p.target_deadline || null,
        confidence: p.confidence,
      })),
      action_decision: v.actionable_verdict?.decision || null,
      action_conviction: v.actionable_verdict?.conviction_level || null,
      action_rationale: v.actionable_verdict?.action_rationale || null,
      raw: data,
    };
  }
  // V2 legacy
  const v2 = data as GeminiV2Response;
  return {
    quarter: v2.quarterly_snapshot?.quarter || fallbackQuarter,
    summary: v2.quarterly_snapshot?.summary || "",
    thesis_status: v2.thesis_status?.status || null,
    thesis_status_reason: v2.thesis_status?.reason || null,
    thesis_momentum: null,
    thesis_drift_status: null,
    thesis_drift_reason: null,
    confidence_score: null,
    management_tone: null,
    dodged_questions: v2.quarterly_snapshot?.dodged_questions || [],
    red_flags: v2.quarterly_snapshot?.red_flags || [],
    metrics: v2.quarterly_snapshot?.metrics || {},
    signals: null,
    key_changes: [],
    promise_updates: (v2.promise_updates || []).map(p => ({
      id: p.id,
      new_status: p.new_status,
      resolved_in_quarter: p.resolved_in_quarter || null,
      evidence: p.evidence,
    })),
    new_promises: (v2.new_promises || []).map(p => ({
      promise_text: p.promise_text,
      made_in_quarter: p.made_in_quarter || fallbackQuarter,
      target_deadline: p.target_deadline || null,
    })),
    action_decision: null,
    action_conviction: null,
    action_rationale: null,
    raw: data,
  };
}

function generateQuarterOptions(): string[] {
  const quarters: string[] = [];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const getFY = (month: number, year: number) => month >= 3 ? year + 1 : year;
  const getQ = (month: number) => {
    if (month >= 3 && month <= 5) return 1;
    if (month >= 6 && month <= 8) return 2;
    if (month >= 9 && month <= 11) return 3;
    return 4;
  };
  for (let offset = -4; offset <= 2; offset++) {
    let m = currentMonth + offset * 3;
    let y = currentYear;
    while (m < 0) { m += 12; y--; }
    while (m >= 12) { m -= 12; y++; }
    quarters.push(`Q${getQ(m)}_FY${String(getFY(m, y)).slice(-2)}`);
  }
  return [...new Set(quarters)];
}

export function ImportGeminiResponse({ stockId, ticker }: Props) {
  const [open, setOpen] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [parsed, setParsed] = useState<NormalizedData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [quarterOverride, setQuarterOverride] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const quarterOptions = useMemo(() => generateQuarterOptions(), []);

  const handleParse = () => {
    try {
      let cleaned = rawJson.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const firstBrace = cleaned.indexOf("{");
      if (firstBrace > 0) cleaned = cleaned.substring(firstBrace);
      let depth = 0, lastBrace = -1, inString = false, escape = false;
      for (let i = 0; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (escape) { escape = false; continue; }
        if (c === "\\") { escape = true; continue; }
        if (c === '"' && !escape) { inString = !inString; continue; }
        if (inString) continue;
        if (c === "{" || c === "[") depth++;
        if (c === "}" || c === "]") { depth--; if (depth === 0) { lastBrace = i; break; } }
      }
      if (lastBrace > 0 && lastBrace < cleaned.length - 1) {
        cleaned = cleaned.substring(0, lastBrace + 1);
      }

      let data: any;
      try {
        data = JSON.parse(cleaned);
      } catch (firstErr) {
        let fixed = cleaned.replace(/\("([^"]*?)"\)/g, '(\\"$1\\")');
        fixed = fixed.replace(/[\u201C\u201D]/g, '\\"').replace(/[\u2018\u2019]/g, "\\'");
        try {
          data = JSON.parse(fixed);
        } catch {
          const match = (firstErr as Error).message.match(/position (\d+)/);
          const pos = match ? parseInt(match[1]) : 0;
          const context = cleaned.substring(Math.max(0, pos - 40), pos + 40);
          throw new Error(`JSON parse error near: ...${context}...`);
        }
      }

      const fallbackQ = (quarterOverride && quarterOverride !== "auto") ? quarterOverride : "";
      const normalized = normalize(data, fallbackQ);

      if (!normalized.quarter && !quarterOverride) {
        throw new Error("Missing quarter. Select one from the dropdown or ensure JSON has a quarter field.");
      }

      setParsed(normalized);
      setParseError(null);
      if (!quarterOverride && normalized.quarter) {
        setQuarterOverride(normalized.quarter);
      }
    } catch (e: any) {
      setParsed(null);
      setParseError(e.message);
    }
  };

  const effectiveQuarter = (quarterOverride && quarterOverride !== "auto") ? quarterOverride : parsed?.quarter || "";

  const handleCommit = async () => {
    if (!parsed || !effectiveQuarter) return;
    setCommitting(true);

    try {
      // Zero-trust: persist via backend which validates with Zod and enforces "pending UUID sandbox".
      const r = await fetch("/api/gemini/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stock_id: stockId,
          quarter: effectiveQuarter,
          payload: parsed,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || `Request failed: ${r.status}`);
      }

      queryClient.invalidateQueries({ queryKey: ["quarterly-snapshots", stockId] });
      queryClient.invalidateQueries({ queryKey: ["management-promises", stockId] });
      queryClient.invalidateQueries({ queryKey: ["snapshot-counts"] });

      toast({
        title: "Committed to database",
        description: `Snapshot: ${effectiveQuarter} | ${data.updatedCount ?? 0} promises updated | ${data.insertedCount ?? 0} new promises added.`,
      });

      setOpen(false);
      setRawJson("");
      setParsed(null);
      setQuarterOverride("");
    } catch (err: any) {
      toast({ title: "Commit failed", description: err.message, variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  const thesisStatusColor = (status: string | null) => {
    if (!status) return "border-muted-foreground";
    switch (status) {
      case "strengthening": return "border-terminal-green text-terminal-green";
      case "weakening": return "border-terminal-amber text-terminal-amber";
      case "broken": return "border-terminal-red text-terminal-red";
      default: return "border-muted-foreground";
    }
  };

  const driftColor = (status: string | null) => {
    if (!status || status === "none") return null;
    if (status === "confirmed") return "border-terminal-red text-terminal-red";
    return "border-terminal-amber text-terminal-amber";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="font-mono text-xs">
          <Upload className="h-3 w-3" />
          <span className="ml-1">Import JSON</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">Import Gemini Response — {ticker}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Quarter (override or auto-detect from JSON)</label>
          <Select value={quarterOverride} onValueChange={setQuarterOverride}>
            <SelectTrigger className="font-mono text-xs h-9 bg-muted border-border">
              <SelectValue placeholder="Auto-detect from JSON" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-[200]">
              <SelectItem key="auto" value="auto" className="font-mono text-xs">Auto-detect from JSON</SelectItem>
              {quarterOptions.map(q => (
                <SelectItem key={q} value={q} className="font-mono text-xs">{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Textarea
          placeholder="Paste Gemini JSON response (V2 or V5 format)..."
          className="font-mono text-xs min-h-[200px]"
          value={rawJson}
          onChange={e => { setRawJson(e.target.value); setParsed(null); setParseError(null); }}
        />

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleParse} className="font-mono text-xs">
            Validate JSON
          </Button>
          {effectiveQuarter && (
            <Button
              variant="destructive"
              size="sm"
              className="font-mono text-xs"
              onClick={async () => {
                if (!confirm(`Delete snapshot + promises for ${effectiveQuarter}? This cannot be undone.`)) return;
                setCommitting(true);
                try {
                  await supabase.from("quarterly_snapshots").delete().eq("stock_id", stockId).eq("quarter", effectiveQuarter);
                  // Revert any promises resolved in this quarter back to pending so ledger state stays consistent.
                  await supabase
                    .from("management_promises")
                    .update({ status: "pending", resolved_in_quarter: null })
                    .eq("stock_id", stockId)
                    .eq("resolved_in_quarter", effectiveQuarter);
                  await supabase.from("management_promises").delete().eq("stock_id", stockId).eq("made_in_quarter", effectiveQuarter);
                  queryClient.invalidateQueries({ queryKey: ["quarterly-snapshots", stockId] });
                  queryClient.invalidateQueries({ queryKey: ["management-promises", stockId] });
                  queryClient.invalidateQueries({ queryKey: ["snapshot-counts"] });
                  toast({ title: `Reset ${effectiveQuarter}`, description: "Snapshot and promises deleted. Ready to re-import." });
                } catch (err: any) {
                  toast({ title: "Reset failed", description: err.message, variant: "destructive" });
                } finally {
                  setCommitting(false);
                }
              }}
            >
              Reset {effectiveQuarter}
            </Button>
          )}
        </div>

        {parseError && (
          <div className="flex items-center gap-2 text-terminal-red font-mono text-xs p-2 bg-terminal-red/10 rounded">
            <AlertTriangle className="h-3 w-3" /> {parseError}
          </div>
        )}

        {parsed && (
          <div className="space-y-3 border border-border rounded p-3">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-terminal-green" />
              <span className="font-mono text-xs text-terminal-green">Valid JSON</span>
              {parsed.thesis_drift_status ? (
                <Badge variant="outline" className="text-[10px]">V5</Badge>
              ) : parsed.signals ? (
                <Badge variant="outline" className="text-[10px]">V3</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">V2 Legacy</Badge>
              )}
            </div>

            <div className="space-y-2 font-mono text-xs">
              {(parsed.thesis_status || parsed.action_decision) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {parsed.thesis_status && (
                    <>
                      <span className="text-muted-foreground">Thesis:</span>
                      <Badge variant="outline" className={`text-[10px] ${thesisStatusColor(parsed.thesis_status)}`}>
                        {parsed.thesis_status.toUpperCase()}
                      </Badge>
                    </>
                  )}
                  {parsed.thesis_momentum && (
                    <Badge variant="outline" className={`text-[10px] ${
                      parsed.thesis_momentum === "improving" ? "text-terminal-green border-terminal-green/30" :
                      parsed.thesis_momentum === "deteriorating" ? "text-terminal-red border-terminal-red/30" :
                      "text-muted-foreground"
                    }`}>
                      {parsed.thesis_momentum}
                    </Badge>
                  )}
                  {parsed.confidence_score != null && (
                    <span className={`${
                      parsed.confidence_score >= 80 ? "text-terminal-green" :
                      parsed.confidence_score >= 60 ? "text-foreground" :
                      parsed.confidence_score >= 40 ? "text-terminal-amber" :
                      "text-terminal-red"
                    }`}>Score: {parsed.confidence_score}</span>
                  )}
                  {parsed.action_decision && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        parsed.action_decision.includes("BUILD") ? "text-terminal-green border-terminal-green/40" :
                        parsed.action_decision.includes("CUT") ? "text-terminal-red border-terminal-red/40" :
                        "text-terminal-amber border-terminal-amber/40"
                      }`}
                    >
                      {parsed.action_decision}
                    </Badge>
                  )}
                  {parsed.action_conviction && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/40">
                      {parsed.action_conviction}
                    </Badge>
                  )}
                </div>
              )}

              {/* Thesis Drift Alert */}
              {parsed.thesis_drift_status && parsed.thesis_drift_status !== "none" && (
                <div className={`p-2.5 rounded border-l-4 ${
                  parsed.thesis_drift_status === "confirmed"
                    ? "bg-terminal-red/10 border-terminal-red"
                    : "bg-terminal-amber/10 border-terminal-amber"
                }`}>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className={`h-3 w-3 ${
                      parsed.thesis_drift_status === "confirmed" ? "text-terminal-red" : "text-terminal-amber"
                    }`} />
                    <span className={`font-bold text-[10px] uppercase ${
                      parsed.thesis_drift_status === "confirmed" ? "text-terminal-red" : "text-terminal-amber"
                    }`}>
                      THESIS DRIFT: {parsed.thesis_drift_status}
                    </span>
                  </div>
                  {parsed.thesis_drift_reason && (
                    <p className="text-[10px] mt-1 text-foreground/80">{parsed.thesis_drift_reason}</p>
                  )}
                </div>
              )}

              <div>
                <span className="text-muted-foreground">Quarter:</span>{" "}
                <Badge variant="outline" className="text-[10px]">{effectiveQuarter}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Summary:</span>{" "}
                <span className="text-foreground">{parsed.summary?.slice(0, 150)}...</span>
              </div>
              {parsed.signals && (
                <div className="flex gap-3">
                  <span className="text-terminal-green">↑{parsed.signals.bullish.length} bullish</span>
                  <span className="text-terminal-amber">⚠{parsed.signals.warnings.length} warnings</span>
                  <span className="text-terminal-red">↓{parsed.signals.bearish.length} bearish</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Red Flags:</span>{" "}
                <span className="text-terminal-red">{parsed.red_flags.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Promise Updates:</span>{" "}
                <span className="text-terminal-amber">{parsed.promise_updates.length}</span>
                {parsed.promise_updates.length > 0 && (
                  <span className="text-muted-foreground ml-2">
                    ({parsed.promise_updates.filter(p => p.new_status === "kept").length} kept, {parsed.promise_updates.filter(p => p.new_status === "broken").length} broken)
                  </span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">New Promises:</span>{" "}
                <span className="text-terminal-green">{parsed.new_promises.length}</span>
              </div>
              {parsed.key_changes.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Key Changes vs Last Q:</span>
                  <ul className="list-disc list-inside text-[10px] mt-1 text-foreground">
                    {parsed.key_changes.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <Button onClick={handleCommit} disabled={committing || !effectiveQuarter} className="w-full font-mono text-xs" size="sm">
              {committing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
              Commit to Database
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
