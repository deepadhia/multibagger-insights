import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Target, TrendingUp, TrendingDown, FileText, MessageSquare } from "lucide-react";

interface TimelineEvent {
  quarter: string;
  type: "snapshot" | "promise_kept" | "promise_broken" | "promise_new";
  content: string;
  severity?: "bullish" | "bearish" | "neutral";
}

interface Props {
  snapshots: any[];
  promises: any[];
}

export function ThesisTimeline({ snapshots, promises }: Props) {
  // Build timeline events sorted by quarter
  const events: TimelineEvent[] = [];

  for (const snap of snapshots || []) {
    const flags = Array.isArray(snap.red_flags) ? snap.red_flags : [];
    const metrics = (snap.metrics && typeof snap.metrics === "object") ? snap.metrics as Record<string, string> : {};
    const metricSummary = Object.entries(metrics).slice(0, 3).map(([k, v]) => {
      const val = String(v);
      const parenIdx = val.indexOf("(");
      return `${k.replace(/_/g, " ")}: ${parenIdx > 0 ? val.slice(0, parenIdx).trim() : val}`;
    }).join(" · ");

    events.push({
      quarter: snap.quarter,
      type: "snapshot",
      content: snap.summary?.slice(0, 120) || metricSummary || "Quarter analyzed",
      severity: flags.length >= 2 ? "bearish" : flags.length === 0 ? "bullish" : "neutral",
    });
  }

  for (const p of promises || []) {
    if (p.status === "kept" && p.resolved_in_quarter) {
      events.push({
        quarter: p.resolved_in_quarter,
        type: "promise_kept",
        content: p.promise_text.slice(0, 100),
        severity: "bullish",
      });
    } else if (p.status === "broken" && p.resolved_in_quarter) {
      events.push({
        quarter: p.resolved_in_quarter,
        type: "promise_broken",
        content: p.promise_text.slice(0, 100),
        severity: "bearish",
      });
    } else if (p.status === "pending") {
      events.push({
        quarter: p.made_in_quarter,
        type: "promise_new",
        content: p.promise_text.slice(0, 100),
        severity: "neutral",
      });
    }
  }

  // Sort by quarter (Q1_FY24 < Q2_FY24 etc.)
  const parseQ = (q: string) => {
    const m = q.match(/Q(\d)_FY(\d{2})/);
    return m ? parseInt(m[2]) * 4 + parseInt(m[1]) : 0;
  };
  events.sort((a, b) => parseQ(b.quarter) - parseQ(a.quarter));

  // Group by quarter
  const byQuarter: Record<string, TimelineEvent[]> = {};
  for (const e of events) {
    if (!byQuarter[e.quarter]) byQuarter[e.quarter] = [];
    byQuarter[e.quarter].push(e);
  }
  const quarters = Object.keys(byQuarter).sort((a, b) => parseQ(b) - parseQ(a));

  if (quarters.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="text-center space-y-2">
          <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground font-mono">No timeline data yet. Import snapshots and promises to build the thesis timeline.</p>
        </div>
      </Card>
    );
  }

  const iconMap = {
    snapshot: FileText,
    promise_kept: CheckCircle,
    promise_broken: AlertTriangle,
    promise_new: Target,
  };

  const colorMap = {
    bullish: "text-terminal-green border-terminal-green/30",
    bearish: "text-terminal-red border-terminal-red/30",
    neutral: "text-muted-foreground border-border",
  };

  return (
    <Card className="p-4 bg-card border-border card-glow">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
        <TrendingUp className="h-3 w-3 text-primary" /> Thesis Timeline
      </h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-4">
          {quarters.map((q) => (
            <div key={q} className="relative pl-10">
              {/* Quarter marker */}
              <div className="absolute left-2 top-1 w-4 h-4 rounded-full bg-card border-2 border-primary flex items-center justify-center z-10">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              </div>

              <div>
                <Badge variant="outline" className="font-mono text-[10px] mb-2">{q}</Badge>
                <div className="space-y-1.5">
                  {byQuarter[q].map((event, i) => {
                    const Icon = iconMap[event.type];
                    const color = colorMap[event.severity || "neutral"];
                    return (
                      <div key={i} className={`flex items-start gap-2 p-2 rounded border bg-muted/20 ${color}`}>
                        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-mono text-[9px] uppercase tracking-wider opacity-60">
                            {event.type === "snapshot" ? "Quarter Review" :
                             event.type === "promise_kept" ? "Promise Kept" :
                             event.type === "promise_broken" ? "Promise Broken" : "New Commitment"}
                          </span>
                          <p className="text-xs text-foreground/80 leading-relaxed">{event.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
