import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, Check, AlertTriangle } from "lucide-react";

interface Props {
  stockId: string;
  ticker: string;
}

interface GeminiResponse {
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

export function ImportGeminiResponse({ stockId, ticker }: Props) {
  const [open, setOpen] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [parsed, setParsed] = useState<GeminiResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleParse = () => {
    try {
      // Strip markdown code fences if present
      let cleaned = rawJson.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const data = JSON.parse(cleaned) as GeminiResponse;
      if (!data.quarterly_snapshot?.quarter) {
        throw new Error("Missing quarterly_snapshot.quarter");
      }
      setParsed(data);
      setParseError(null);
    } catch (e: any) {
      setParsed(null);
      setParseError(e.message);
    }
  };

  const handleCommit = async () => {
    if (!parsed) return;
    setCommitting(true);

    try {
      const snap = parsed.quarterly_snapshot;

      // 1. Upsert quarterly snapshot
      const { error: snapErr } = await supabase
        .from("quarterly_snapshots")
        .upsert({
          stock_id: stockId,
          quarter: snap.quarter,
          summary: snap.summary,
          dodged_questions: snap.dodged_questions || [],
          red_flags: snap.red_flags || [],
          metrics: snap.metrics || {},
          raw_ai_output: parsed as any,
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
              resolved_in_quarter: pu.resolved_in_quarter || snap.quarter,
            })
            .eq("id", pu.id);
          if (!error) updatedCount++;
        }
      }

      // 3. Insert new promises
      let insertedCount = 0;
      if (parsed.new_promises?.length) {
        const rows = parsed.new_promises.map(np => ({
          stock_id: stockId,
          promise_text: np.promise_text,
          made_in_quarter: np.made_in_quarter,
          target_deadline: np.target_deadline || null,
          status: "pending",
        }));
        const { error } = await supabase.from("management_promises").insert(rows);
        if (!error) insertedCount = rows.length;
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["quarterly-snapshots", stockId] });
      queryClient.invalidateQueries({ queryKey: ["management-promises", stockId] });

      toast({
        title: "Committed to database",
        description: `Snapshot: ${snap.quarter} | ${updatedCount} promises resolved | ${insertedCount} new promises added`,
      });

      setOpen(false);
      setRawJson("");
      setParsed(null);
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
              <div>
                <span className="text-muted-foreground">Quarter:</span>{" "}
                <Badge variant="outline" className="text-[10px]">{parsed.quarterly_snapshot.quarter}</Badge>
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

            <Button onClick={handleCommit} disabled={committing} className="w-full font-mono text-xs" size="sm">
              {committing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
              Commit to Database
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
