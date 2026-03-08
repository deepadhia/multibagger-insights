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

// V3 response format with nested metrics
interface GeminiV3Response {
  quarter: string;
  snapshot: {
    summary: string;
    management_tone: "bullish" | "neutral" | "cautious";
    thesis_status: "strengthening" | "stable" | "weakening" | "broken";
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
    dodged_questions?: string[];
    red_flags?: string[];
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

// V2 legacy format for backward compatibility
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

// Normalized internal format
interface NormalizedData {
  quarter: string;
  summary: string;
  thesis_status: string | null;
  thesis_status_reason: string | null;
  confidence_score: number | null;
  management_tone: string | null;
  dodged_questions: string[];
  red_flags: string[];
  metrics: Record<string, unknown>;
  signals: { bullish: string[]; warnings: string[]; bearish: string[] } | null;
  key_changes: string[];
  promise_updates: { id: string; new_status: string; resolved_in_quarter: string | null; evidence?: string }[];
  new_promises: { promise_text: string; made_in_quarter: string; target_deadline: string | null; confidence?: string }[];
  raw: unknown;
}

function isV3(data: any): data is GeminiV3Response {
  return data.snapshot && data.metrics && typeof data.quarter === "string";
}

function normalize(data: any, fallbackQuarter: string): NormalizedData {
  if (isV3(data)) {
    const v3 = data as GeminiV3Response;
    return {
      quarter: v3.quarter || fallbackQuarter,
      summary: v3.snapshot.summary,
      thesis_status: v3.snapshot.thesis_status,
      thesis_status_reason: v3.snapshot.key_changes_vs_last_quarter?.join("; ") || null,
      confidence_score: v3.snapshot.confidence_score,
      management_tone: v3.snapshot.management_tone,
      dodged_questions: v3.management_analysis?.dodged_questions || [],
      red_flags: v3.management_analysis?.red_flags || [],
      metrics: v3.metrics,
      signals: v3.signals ? {
        bullish: v3.signals.bullish || [],
        warnings: v3.signals.warnings || [],
        bearish: v3.signals.bearish || [],
      } : null,
      key_changes: v3.snapshot.key_changes_vs_last_quarter || [],
      promise_updates: (v3.promise_updates || []).map(p => ({
        id: p.id,
        new_status: p.status,
        resolved_in_quarter: p.resolved_quarter || null,
        evidence: p.evidence,
      })),
      new_promises: (v3.new_promises || []).map(p => ({
        promise_text: p.promise_text,
        made_in_quarter: v3.quarter || fallbackQuarter,
        target_deadline: p.target_deadline || null,
        confidence: p.confidence,
      })),
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
      // 1. Upsert quarterly snapshot
      const { error: snapErr } = await supabase
        .from("quarterly_snapshots")
        .upsert({
          stock_id: stockId,
          quarter: effectiveQuarter,
          summary: parsed.summary,
          dodged_questions: parsed.dodged_questions,
          red_flags: parsed.red_flags,
          metrics: parsed.metrics as any,
          raw_ai_output: parsed.raw as any,
          thesis_status: parsed.thesis_status,
          thesis_status_reason: parsed.thesis_status_reason,
        }, { onConflict: "stock_id,quarter" });

      if (snapErr) throw snapErr;

      // 2. Update existing promises
      let updatedCount = 0;
      for (const pu of parsed.promise_updates) {
        if (!pu.id || pu.new_status === "pending") continue;
        const { error } = await supabase
          .from("management_promises")
          .update({
            status: pu.new_status,
            resolved_in_quarter: pu.resolved_in_quarter || effectiveQuarter,
          })
          .eq("id", pu.id);
        if (!error) updatedCount++;
      }

      // 3. Insert new promises (deduplicate)
      let insertedCount = 0;
      if (parsed.new_promises.length > 0) {
        const { data: existingPromises } = await supabase
          .from("management_promises")
          .select("promise_text, made_in_quarter")
          .eq("stock_id", stockId);

        const existingSet = new Set(
          (existingPromises || []).map(p => `${p.promise_text}::${p.made_in_quarter}`)
        );

        const newRows = parsed.new_promises
          .map(np => ({
            stock_id: stockId,
            promise_text: np.promise_text,
            made_in_quarter: np.made_in_quarter || effectiveQuarter,
            target_deadline: np.target_deadline || null,
            status: "pending",
          }))
          .filter(row => !existingSet.has(`${row.promise_text}::${row.made_in_quarter}`));

        if (newRows.length > 0) {
          const { error } = await supabase.from("management_promises").insert(newRows);
          if (!error) insertedCount = newRows.length;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["quarterly-snapshots", stockId] });
      queryClient.invalidateQueries({ queryKey: ["management-promises", stockId] });

      toast({
        title: "Committed to database",
        description: `Snapshot: ${effectiveQuarter} | ${updatedCount} promises resolved | ${insertedCount} new promises added`,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="font-mono text-xs">
          <Upload className="h-3 w-3" />
          <span className="ml-1">Import Gemini</span>
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
          placeholder="Paste Gemini JSON response (V2 or V3 format)..."
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
                  await supabase.from("management_promises").delete().eq("stock_id", stockId).eq("made_in_quarter", effectiveQuarter);
                  queryClient.invalidateQueries({ queryKey: ["quarterly-snapshots", stockId] });
                  queryClient.invalidateQueries({ queryKey: ["management-promises", stockId] });
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
              {parsed.signals ? (
                <Badge variant="outline" className="text-[10px]">V3</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">V2 Legacy</Badge>
              )}
            </div>

            <div className="space-y-2 font-mono text-xs">
              {parsed.thesis_status && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Thesis:</span>
                  <Badge variant="outline" className={`text-[10px] ${thesisStatusColor(parsed.thesis_status)}`}>
                    {parsed.thesis_status.toUpperCase()}
                  </Badge>
                  {parsed.confidence_score != null && (
                    <span className="text-muted-foreground">Score: {parsed.confidence_score}</span>
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
