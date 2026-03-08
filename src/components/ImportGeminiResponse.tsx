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

interface GeminiResponse {
  thesis_status?: {
    status: "strengthening" | "stable" | "weakening" | "broken";
    reason: string;
  };
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

function generateQuarterOptions(): string[] {
  const quarters: string[] = [];
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentYear = now.getFullYear();

  // Determine current FY quarter
  // Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  // FY year = if month >= Apr (3), year+1, else year
  const getFY = (month: number, year: number) => month >= 3 ? year + 1 : year;
  const getQ = (month: number) => {
    if (month >= 3 && month <= 5) return 1;
    if (month >= 6 && month <= 8) return 2;
    if (month >= 9 && month <= 11) return 3;
    return 4; // 0, 1, 2
  };

  // Generate quarters: 4 past + current + 2 future = ~7 quarters
  const startMonth = currentMonth;
  const startYear = currentYear;

  // Go back 12 months (4 quarters) and forward 6 months (2 quarters)
  for (let offset = -4; offset <= 2; offset++) {
    let m = startMonth + offset * 3;
    let y = startYear;
    while (m < 0) { m += 12; y--; }
    while (m >= 12) { m -= 12; y++; }
    const q = getQ(m);
    const fy = getFY(m, y);
    quarters.push(`Q${q}_FY${String(fy).slice(-2)}`);
  }

  // Deduplicate and return
  return [...new Set(quarters)];
}

export function ImportGeminiResponse({ stockId, ticker }: Props) {
  const [open, setOpen] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [parsed, setParsed] = useState<GeminiResponse | null>(null);
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
      // Strip leading/trailing non-JSON text
      const firstBrace = cleaned.indexOf("{");
      if (firstBrace > 0) cleaned = cleaned.substring(firstBrace);
      // Find matching closing brace (string-aware)
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
      
      // Try parsing; if it fails, attempt to fix unescaped quotes in string values
      let data: GeminiResponse;
      try {
        data = JSON.parse(cleaned) as GeminiResponse;
      } catch (firstErr) {
        // Fix unescaped quotes inside JSON string values: ("text") → (\"text\")
        // Replace inner quotes that follow ( or precede ) inside strings
        let fixed = cleaned.replace(/\("([^"]*?)"\)/g, '(\\"$1\\")');
        // Also try removing smart quotes
        fixed = fixed.replace(/[\u201C\u201D]/g, '\\"').replace(/[\u2018\u2019]/g, "\\'");
        try {
          data = JSON.parse(fixed) as GeminiResponse;
        } catch {
          // Last resort: try to extract just by relaxed regex for the error position
          const match = (firstErr as Error).message.match(/position (\d+)/);
          const pos = match ? parseInt(match[1]) : 0;
          const context = cleaned.substring(Math.max(0, pos - 40), pos + 40);
          throw new Error(`JSON parse error near: ...${context}...`);
        }
      }
      if (!data.quarterly_snapshot?.quarter && !quarterOverride) {
        throw new Error("Missing quarter. Select one from the dropdown or ensure JSON has quarterly_snapshot.quarter");
      }
      setParsed(data);
      setParseError(null);
      // Auto-set quarter override from JSON if not manually set
      if (!quarterOverride && data.quarterly_snapshot?.quarter) {
        setQuarterOverride(data.quarterly_snapshot.quarter);
      }
    } catch (e: any) {
      setParsed(null);
      setParseError(e.message);
    }
  };

  const effectiveQuarter = (quarterOverride && quarterOverride !== "auto") ? quarterOverride : parsed?.quarterly_snapshot?.quarter || "";

  const handleCommit = async () => {
    if (!parsed || !effectiveQuarter) return;
    setCommitting(true);

    try {
      const snap = parsed.quarterly_snapshot;

      // 1. Upsert quarterly snapshot (with thesis_status)
      const { error: snapErr } = await supabase
        .from("quarterly_snapshots")
        .upsert({
          stock_id: stockId,
          quarter: effectiveQuarter,
          summary: snap.summary,
          dodged_questions: snap.dodged_questions || [],
          red_flags: snap.red_flags || [],
          metrics: snap.metrics || {},
          raw_ai_output: parsed as any,
          thesis_status: parsed.thesis_status?.status || null,
          thesis_status_reason: parsed.thesis_status?.reason || null,
        }, { onConflict: "stock_id,quarter" });

      if (snapErr) throw snapErr;

      // 2. Update existing promises
      let updatedCount = 0;
      if (parsed.promise_updates?.length) {
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
      }

      // 3. Insert new promises (deduplicate against existing)
      let insertedCount = 0;
      if (parsed.new_promises?.length) {
        // Fetch existing promises for this stock to avoid duplicates
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

        {/* Quarter selector */}
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
          placeholder="Paste Gemini JSON response here..."
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
                const q = effectiveQuarter;
                if (!confirm(`Delete snapshot + promises for ${q}? This cannot be undone.`)) return;
                setCommitting(true);
                try {
                  await supabase.from("quarterly_snapshots").delete().eq("stock_id", stockId).eq("quarter", q);
                  await supabase.from("management_promises").delete().eq("stock_id", stockId).eq("made_in_quarter", q);
                  queryClient.invalidateQueries({ queryKey: ["quarterly-snapshots", stockId] });
                  queryClient.invalidateQueries({ queryKey: ["management-promises", stockId] });
                  toast({ title: `Reset ${q}`, description: "Snapshot and promises deleted. Ready to re-import." });
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
            </div>

            <div className="space-y-2 font-mono text-xs">
              {parsed.thesis_status && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Thesis Status:</span>{" "}
                  <Badge variant="outline" className={`text-[10px] ${
                    parsed.thesis_status.status === "strengthening" ? "border-terminal-green text-terminal-green" :
                    parsed.thesis_status.status === "weakening" ? "border-terminal-amber text-terminal-amber" :
                    parsed.thesis_status.status === "broken" ? "border-terminal-red text-terminal-red" :
                    "border-muted-foreground"
                  }`}>
                    {parsed.thesis_status.status.toUpperCase()}
                  </Badge>
                  <span className="text-muted-foreground text-[10px] truncate max-w-[300px]">{parsed.thesis_status.reason}</span>
                </div>
              )}
                <span className="text-muted-foreground">Quarter:</span>{" "}
                <Badge variant="outline" className="text-[10px]">{effectiveQuarter}</Badge>
                {quarterOverride && parsed.quarterly_snapshot.quarter && quarterOverride !== parsed.quarterly_snapshot.quarter && (
                  <span className="text-terminal-amber ml-2 text-[10px]">
                    (overriding JSON's "{parsed.quarterly_snapshot.quarter}")
                  </span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Summary:</span>{" "}
                <span className="text-foreground">{parsed.quarterly_snapshot.summary?.slice(0, 150)}...</span>
              </div>
              <div>
                <span className="text-muted-foreground">Red Flags:</span>{" "}
                <span className="text-terminal-red">{parsed.quarterly_snapshot.red_flags?.length || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Promise Updates:</span>{" "}
                <span className="text-terminal-amber">{parsed.promise_updates?.length || 0}</span>
                {parsed.promise_updates && parsed.promise_updates.length > 0 && (
                  <span className="text-muted-foreground ml-2">
                    ({parsed.promise_updates.filter(p => p.new_status === "kept").length} kept, {parsed.promise_updates.filter(p => p.new_status === "broken").length} broken)
                  </span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">New Promises:</span>{" "}
                <span className="text-terminal-green">{parsed.new_promises?.length || 0}</span>
              </div>
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
