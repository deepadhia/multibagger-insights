import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { calculateThesisScore, getCategoryBreakdown, type Signal } from "@/lib/signals";

interface ThesisScoreProps {
  signals: Signal[];
}

export function ThesisScore({ signals }: ThesisScoreProps) {
  if (signals.length === 0) return null;

  const score = calculateThesisScore(signals);
  const breakdown = getCategoryBreakdown(signals);
  const bullish = signals.filter(s => s.type === "bullish");
  const bearish = signals.filter(s => s.type === "bearish");
  const warning = signals.filter(s => s.type === "warning");

  const getVerdict = () => {
    if (score >= 75) return { label: "Strong Buy", color: "text-terminal-green", icon: TrendingUp, progressColor: "bg-terminal-green" };
    if (score >= 55) return { label: "Accumulate", color: "text-terminal-green/80", icon: TrendingUp, progressColor: "bg-terminal-green/70" };
    if (score >= 40) return { label: "Hold", color: "text-terminal-amber", icon: Minus, progressColor: "bg-terminal-amber" };
    if (score >= 25) return { label: "Caution", color: "text-terminal-amber", icon: TrendingDown, progressColor: "bg-terminal-amber/70" };
    return { label: "Review Thesis", color: "text-terminal-red", icon: TrendingDown, progressColor: "bg-terminal-red" };
  };

  const verdict = getVerdict();
  const Icon = verdict.icon;

  return (
    <div className="bg-card border border-border rounded-lg p-4 card-glow">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Thesis Score</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm bg-popover border-border p-3">
              <p className="font-mono text-[10px] text-muted-foreground mb-2">Category-weighted scoring (Financial 40% · Concall 30% · Credibility 20% · Shareholding 10%)</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {breakdown.map(cat => (
                  <div key={cat.category} className="border-b border-border/30 pb-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-foreground">{cat.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {Math.round(cat.weight * 100)}% → <span className={cat.score >= 60 ? "text-terminal-green" : cat.score >= 40 ? "text-terminal-amber" : "text-terminal-red"}>{cat.score}</span>
                      </span>
                    </div>
                    <div className="flex gap-2 font-mono text-[9px] mt-0.5">
                      {cat.bullish > 0 && <span className="text-terminal-green">✓{cat.bullish}</span>}
                      {cat.warning > 0 && <span className="text-terminal-amber">⚠{cat.warning}</span>}
                      {cat.bearish > 0 && <span className="text-terminal-red">✗{cat.bearish}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-1.5 border-t border-border">
                <div className="space-y-1">
                  {bearish.length > 0 && bearish.slice(0, 4).map((s, i) => (
                    <p key={i} className="font-mono text-[9px] text-terminal-red/80">✗ {s.label}</p>
                  ))}
                  {warning.length > 0 && warning.slice(0, 3).map((s, i) => (
                    <p key={i} className="font-mono text-[9px] text-terminal-amber/80">⚠ {s.label}</p>
                  ))}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-3xl font-mono font-bold ${verdict.color}`}>{score}</span>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon className={`h-3.5 w-3.5 ${verdict.color}`} />
            <span className={`font-mono text-xs font-semibold ${verdict.color}`}>{verdict.label}</span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${verdict.progressColor}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>
      {/* Category mini-bars */}
      <div className="mt-3 space-y-1">
        {breakdown.map(cat => (
          <div key={cat.category} className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted-foreground w-20 truncate">{cat.label}</span>
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${cat.score >= 60 ? "bg-terminal-green/70" : cat.score >= 40 ? "bg-terminal-amber/70" : "bg-terminal-red/70"}`}
                style={{ width: `${cat.score}%` }}
              />
            </div>
            <span className="font-mono text-[9px] text-muted-foreground w-5 text-right">{cat.score}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 font-mono text-[10px]">
        <span className="text-terminal-green">✓ {bullish.length} bullish</span>
        <span className="text-terminal-amber">⚠ {warning.length} watch</span>
        <span className="text-terminal-red">✗ {bearish.length} bearish</span>
      </div>
    </div>
  );
}
