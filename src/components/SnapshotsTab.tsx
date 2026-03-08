import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuarterlySnapshots } from "@/hooks/useStocks";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, MessageSquare, FileText, Code, Save, Loader2, ChevronDown, ChevronRight } from "lucide-react";

const MOCK_SNAPSHOTS = [
  {
    id: "mock-snap-1",
    quarter: "Q4FY25",
    summary: "Strong quarter with revenue growth of 22% YoY driven by export orders and domestic demand recovery. Management guided for continued momentum with new capacity coming online in H1FY26.",
    dodged_questions: ["What is the exact timeline for the Hosur plant commissioning?", "Can you quantify the impact of raw material cost inflation?"],
    red_flags: ["Inventory days increased from 45 to 62", "Receivables grew faster than revenue"],
    metrics: { revenue_growth: 22, opm: 19.5, pat_growth: 28 },
    raw_ai_output: null,
    created_at: new Date().toISOString(),
    stock_id: "",
  },
  {
    id: "mock-snap-2",
    quarter: "Q3FY25",
    summary: "Muted quarter impacted by seasonal slowdown and delayed government orders. Management remains confident of full-year guidance.",
    dodged_questions: ["Why did promoter holding decrease?"],
    red_flags: ["Employee costs rising faster than revenue"],
    metrics: { revenue_growth: 8, opm: 17.2, pat_growth: 5 },
    raw_ai_output: null,
    created_at: new Date().toISOString(),
    stock_id: "",
  },
];

interface Props {
  stockId: string;
}

export function SnapshotsTab({ stockId }: Props) {
  const { data: dbSnapshots } = useQuarterlySnapshots(stockId);
  const snapshots = dbSnapshots && dbSnapshots.length > 0 ? dbSnapshots : MOCK_SNAPSHOTS;
  const isMock = !dbSnapshots || dbSnapshots.length === 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState<string | null>(null);

  const startEditing = (snap: any) => {
    const json = snap.raw_ai_output || {
      summary: snap.summary,
      dodged_questions: snap.dodged_questions,
      red_flags: snap.red_flags,
      metrics: snap.metrics,
    };
    setEditJson(JSON.stringify(json, null, 2));
    setEditingId(snap.id);
  };

  const handleSave = async (snapId: string) => {
    try {
      const parsed = JSON.parse(editJson);
      setSaving(true);

      const update: Record<string, any> = { raw_ai_output: parsed };
      // Also update parsed fields if they exist in the JSON
      if (parsed.summary !== undefined) update.summary = parsed.summary;
      if (parsed.dodged_questions !== undefined) update.dodged_questions = parsed.dodged_questions;
      if (parsed.red_flags !== undefined) update.red_flags = parsed.red_flags;
      if (parsed.metrics !== undefined) update.metrics = parsed.metrics;

      const { error } = await supabase.from("quarterly_snapshots").update(update).eq("id", snapId);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["quarterly-snapshots", stockId] });
      setEditingId(null);
      toast({ title: "Snapshot updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message?.includes("JSON") ? "Invalid JSON" : err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {isMock && (
        <Card className="p-3 bg-muted/50 border-border rounded">
          <p className="text-xs text-muted-foreground">
            <strong>Mock data shown.</strong> Import a Gemini analysis from the Transcripts page to populate real quarterly snapshots.
          </p>
        </Card>
      )}

      {snapshots.map((snap) => {
        const dodged = (Array.isArray(snap.dodged_questions) ? snap.dodged_questions : []) as string[];
        const flags = (Array.isArray(snap.red_flags) ? snap.red_flags : []) as string[];
        const metrics = (snap.metrics && typeof snap.metrics === "object" ? snap.metrics : {}) as Record<string, number>;
        const isEditing = editingId === snap.id;
        const isExpanded = expandedRaw === snap.id;

        return (
          <Card key={snap.id} className="p-5 bg-card border-border card-glow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {snap.quarter}
              </h3>
              <div className="flex items-center gap-2">
                {snap.raw_ai_output && (
                  <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                    Raw JSON saved
                  </Badge>
                )}
                {!isMock && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="font-mono text-[10px] h-6 px-2"
                    onClick={() => isEditing ? setEditingId(null) : startEditing(snap)}
                  >
                    <Code className="h-3 w-3 mr-1" />
                    {isEditing ? "Cancel" : "Edit JSON"}
                  </Button>
                )}
              </div>
            </div>

            {/* JSON Editor */}
            {isEditing && (
              <div className="mb-4 space-y-2">
                <Textarea
                  value={editJson}
                  onChange={(e) => setEditJson(e.target.value)}
                  className="font-mono text-xs min-h-[200px] bg-muted border-border"
                  placeholder="Paste or edit JSON..."
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleSave(snap.id)} disabled={saving} className="font-mono text-xs">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingId(null)} className="font-mono text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Summary */}
            {snap.summary && (
              <p className="text-sm text-foreground leading-relaxed mb-4">{snap.summary}</p>
            )}

            {/* Metrics chips */}
            {Object.keys(metrics).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(metrics).map(([key, val]) => (
                  <Badge key={key} variant="secondary" className="font-mono text-[10px]">
                    {key.replace(/_/g, " ")}: {val}
                    {key.includes("growth") || key.includes("opm") || key.includes("margin") ? "%" : ""}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dodged Questions */}
              {dodged.length > 0 && (
                <div className="p-3 bg-muted rounded border border-border/50">
                  <h4 className="font-mono text-[10px] uppercase tracking-wider text-terminal-amber mb-2 flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3" /> Dodged Questions ({dodged.length})
                  </h4>
                  <ul className="space-y-1.5">
                    {dodged.map((q, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0 bg-terminal-amber" />
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Red Flags */}
              {flags.length > 0 && (
                <div className="p-3 bg-muted rounded border border-border/50">
                  <h4 className="font-mono text-[10px] uppercase tracking-wider text-terminal-red mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" /> Red Flags ({flags.length})
                  </h4>
                  <ul className="space-y-1.5">
                    {flags.map((f, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0 bg-terminal-red" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* View Raw AI Output */}
            {snap.raw_ai_output && !isEditing && (
              <div className="mt-4">
                <button
                  className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setExpandedRaw(isExpanded ? null : snap.id)}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  View Raw AI Output
                </button>
                {isExpanded && (
                  <pre className="mt-2 p-3 bg-muted rounded border border-border/50 text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-[300px] overflow-y-auto">
                    {JSON.stringify(snap.raw_ai_output, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
