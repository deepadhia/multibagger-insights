import { Card } from "@/components/ui/card";
import { Shield, Target, MessageSquare, Zap } from "lucide-react";
import { calculateCredibilityDimensions, type CredibilityDimensions } from "@/lib/signals";

interface Props {
  promises: any[];
  analyses: any[];
  commitments: any[];
}

function DimensionBar({ label, value, icon: Icon }: { label: string; value: number | null; icon: any }) {
  if (value === null) return null;
  const color = value >= 70 ? "bg-terminal-green" : value >= 40 ? "bg-terminal-amber" : "bg-terminal-red";
  const textColor = value >= 70 ? "text-terminal-green" : value >= 40 ? "text-terminal-amber" : "text-terminal-red";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
        </div>
        <span className={`font-mono text-xs font-bold ${textColor}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ManagementCredibility({ promises, analyses, commitments }: Props) {
  const dims = calculateCredibilityDimensions(promises, analyses, commitments);

  if (dims.overall === null) return null;

  const overallColor = dims.overall >= 70 ? "text-terminal-green" : dims.overall >= 40 ? "text-terminal-amber" : "text-terminal-red";

  return (
    <Card className="p-4 bg-card border-border card-glow">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
        <Shield className="h-3 w-3 text-primary" /> Management Credibility
      </h3>
      <div className="flex items-center gap-6 mb-4">
        <div className="text-center">
          <p className={`text-4xl font-mono font-bold ${overallColor}`}>{dims.overall}%</p>
          <p className="text-[10px] text-muted-foreground font-mono mt-1">Overall Score</p>
        </div>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${dims.overall >= 70 ? "bg-terminal-green" : dims.overall >= 40 ? "bg-terminal-amber" : "bg-terminal-red"}`}
            style={{ width: `${dims.overall}%` }}
          />
        </div>
      </div>
      <div className="space-y-3">
        <DimensionBar label="Guidance Accuracy" value={dims.guidanceAccuracy} icon={Target} />
        <DimensionBar label="Narrative Consistency" value={dims.narrativeConsistency} icon={MessageSquare} />
        <DimensionBar label="Execution Speed" value={dims.executionSpeed} icon={Zap} />
      </div>
      <div className="mt-3 pt-2 border-t border-border/50">
        <p className="font-mono text-[9px] text-muted-foreground">
          Weighted: Guidance 50% · Narrative 30% · Execution 20%
        </p>
      </div>
    </Card>
  );
}
