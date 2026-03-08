import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuarterlySnapshots } from "@/hooks/useStocks";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, MessageSquare, FileText, Code, Save, Loader2,
  ChevronDown, ChevronRight, BarChart3, TrendingUp, TrendingDown, Minus, ArrowRightLeft, Trash2
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Props {
  stockId: string;
}

export function SnapshotsTab({ stockId }: Props) {
  const { data: dbSnapshots } = useQuarterlySnapshots(stockId);
  const snapshots = dbSnapshots && dbSnapshots.length > 0 ? dbSnapshots : [];
  const isEmpty = !dbSnapshots || dbSnapshots.length === 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedSnap, setExpandedSnap] = useState<string | null>(
    // Auto-expand the first snapshot
    null
  );

  // Auto-expand first on load
  const effectiveExpanded = expandedSnap ?? (snapshots.length > 0 ? snapshots[0].id : null);

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

  if (isEmpty) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="text-center space-y-2">
          <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground font-mono">
            No snapshots yet. Import a Gemini analysis to populate quarterly snapshots.
          </p>
        </div>
      </Card>
    );
  }

  // Build QoQ comparison data
  const qoqData = snapshots.length >= 2 ? buildQoQComparison(snapshots) : null;

  return (
    <div className="space-y-3">
      {/* ═══ QoQ Comparison Table ═══ */}
      {qoqData && qoqData.metricKeys.length > 0 && (
        <Card className="bg-card border-border overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <h3 className="font-mono text-xs font-semibold text-foreground flex items-center gap-2">
              <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
              Quarter-over-Quarter Comparison
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-[160px]">
                    Metric
                  </th>
                  {qoqData.quarters.map((q) => (
                    <th key={q} className="text-center p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground min-w-[140px]">
                      {q}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qoqData.metricKeys.map((key) => (
                  <tr key={key} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs text-foreground font-medium capitalize">
                      {key.replace(/_/g, " ")}
                    </td>
                    {qoqData.quarters.map((q, qi) => {
                      const val = qoqData.values[q]?.[key];
                      const prevQ = qi < qoqData.quarters.length - 1 ? qoqData.quarters[qi + 1] : null;
                      const prevVal = prevQ ? qoqData.values[prevQ]?.[key] : null;
                      const displayVal = val ? extractValue(val) : "—";
                      const trend = val && prevVal ? getTrend(val, prevVal) : null;

                      return (
                        <td key={q} className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="font-mono text-xs text-foreground">{displayVal}</span>
                            {trend && (
                              <span className={`flex-shrink-0 ${
                                trend === "up" ? "text-terminal-green" :
                                trend === "down" ? "text-terminal-red" :
                                "text-muted-foreground"
                              }`}>
                                {trend === "up" && <TrendingUp className="h-3 w-3" />}
                                {trend === "down" && <TrendingDown className="h-3 w-3" />}
                                {trend === "flat" && <Minus className="h-3 w-3" />}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {snapshots.map((snap) => {
        const dodged = (Array.isArray(snap.dodged_questions) ? snap.dodged_questions : []) as string[];
        const flags = (Array.isArray(snap.red_flags) ? snap.red_flags : []) as string[];
        const metrics = (snap.metrics && typeof snap.metrics === "object" ? snap.metrics : {}) as Record<string, string>;
        const isEditing = editingId === snap.id;
        const isOpen = effectiveExpanded === snap.id;

        return (
          <Collapsible
            key={snap.id}
            open={isOpen}
            onOpenChange={(open) => setExpandedSnap(open ? snap.id : null)}
          >
            <Card className="bg-card border-border overflow-hidden">
              {/* ═══ Header — always visible ═══ */}
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-mono text-sm font-semibold text-foreground">
                        {snap.quarter}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-1 max-w-[500px]">
                        {snap.summary?.slice(0, 100)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {flags.length > 0 && (
                      <Badge variant="destructive" className="font-mono text-[10px] gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {flags.length}
                      </Badge>
                    )}
                    {dodged.length > 0 && (
                      <Badge variant="outline" className="font-mono text-[10px] gap-1 text-terminal-amber border-terminal-amber/30">
                        <MessageSquare className="h-2.5 w-2.5" />
                        {dodged.length}
                      </Badge>
                    )}
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
              </CollapsibleTrigger>

              {/* ═══ Expanded content ═══ */}
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-4 border-t border-border/50">

                  {/* Edit button row */}
                  <div className="flex justify-end pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="font-mono text-[10px] h-6 px-2"
                      onClick={(e) => { e.stopPropagation(); isEditing ? setEditingId(null) : startEditing(snap); }}
                    >
                      <Code className="h-3 w-3 mr-1" />
                      {isEditing ? "Cancel" : "Edit JSON"}
                    </Button>
                  </div>

                  {/* JSON Editor */}
                  {isEditing && (
                    <div className="space-y-2">
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
                  {snap.summary && !isEditing && (
                    <p className="text-sm text-foreground/90 leading-relaxed">{snap.summary}</p>
                  )}

                  {/* ═══ Metrics Grid ═══ */}
                  {Object.keys(metrics).length > 0 && !isEditing && (
                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <BarChart3 className="h-3 w-3" /> Key Metrics
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(metrics).map(([key, val]) => {
                          const label = key.replace(/_/g, " ");
                          // Extract just the value part before any parenthetical source quote
                          const valueStr = String(val);
                          const parenIdx = valueStr.indexOf("(");
                          const displayValue = parenIdx > 0 ? valueStr.slice(0, parenIdx).trim() : valueStr;
                          const sourceQuote = parenIdx > 0 ? valueStr.slice(parenIdx) : null;

                          return (
                            <div
                              key={key}
                              className="p-2.5 bg-muted/50 rounded border border-border/30 group"
                              title={sourceQuote || undefined}
                            >
                              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
                                {label}
                              </p>
                              <p className="font-mono text-xs font-semibold text-foreground truncate">
                                {displayValue}
                              </p>
                              {sourceQuote && (
                                <p className="font-mono text-[8px] text-muted-foreground/60 truncate mt-0.5 hidden group-hover:block">
                                  {sourceQuote}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ═══ Red Flags & Dodged Questions — side by side ═══ */}
                  {(flags.length > 0 || dodged.length > 0) && !isEditing && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {flags.length > 0 && (
                        <div className="p-3 rounded border border-terminal-red/20 bg-terminal-red/5">
                          <h4 className="font-mono text-[10px] uppercase tracking-wider text-terminal-red mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3" /> Red Flags
                          </h4>
                          <ul className="space-y-2">
                            {flags.map((f, i) => (
                              <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 bg-terminal-red/70" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {dodged.length > 0 && (
                        <div className="p-3 rounded border border-terminal-amber/20 bg-terminal-amber/5">
                          <h4 className="font-mono text-[10px] uppercase tracking-wider text-terminal-amber mb-2 flex items-center gap-1.5">
                            <MessageSquare className="h-3 w-3" /> Dodged Questions
                          </h4>
                          <ul className="space-y-2">
                            {dodged.map((q, i) => (
                              <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 bg-terminal-amber/70" />
                                {q}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raw AI Output toggle */}
                  {snap.raw_ai_output && !isEditing && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                        <Code className="h-3 w-3" />
                        View Raw AI Output
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="mt-2 p-3 bg-muted rounded border border-border/50 text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-[300px] overflow-y-auto">
                          {JSON.stringify(snap.raw_ai_output, null, 2)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}

// ═══ Helper functions for QoQ comparison ═══

function extractValue(val: string): string {
  const s = String(val);
  const parenIdx = s.indexOf("(");
  return parenIdx > 0 ? s.slice(0, parenIdx).trim() : s;
}

function extractNumber(val: string): number | null {
  const clean = extractValue(val);
  // Try to extract a number from strings like "11% YoY", "₹266 Cr", "30%", "15%"
  const match = clean.match(/-?[\d,.]+/);
  if (!match) return null;
  return parseFloat(match[0].replace(/,/g, ""));
}

function getTrend(current: string, previous: string): "up" | "down" | "flat" | null {
  const curr = extractNumber(current);
  const prev = extractNumber(previous);
  if (curr === null || prev === null) return null;
  if (curr > prev) return "up";
  if (curr < prev) return "down";
  return "flat";
}

function buildQoQComparison(snapshots: any[]) {
  // snapshots are ordered by created_at DESC, so newest first
  const quarters = snapshots.map(s => s.quarter);
  const values: Record<string, Record<string, string>> = {};
  const allKeys = new Set<string>();

  for (const snap of snapshots) {
    const metrics = (snap.metrics && typeof snap.metrics === "object" ? snap.metrics : {}) as Record<string, string>;
    values[snap.quarter] = metrics;
    Object.keys(metrics).forEach(k => allKeys.add(k));
  }

  return {
    quarters,
    metricKeys: Array.from(allKeys),
    values,
  };
}