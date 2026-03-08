import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Signal {
  label: string;
  type: "bullish" | "warning" | "bearish";
}

interface ThesisScoreProps {
  signals: Signal[];
}

export function ThesisScore({ signals }: ThesisScoreProps) {
  if (signals.length === 0) return null;

  const bullish = signals.filter(s => s.type === "bullish").length;
  const bearish = signals.filter(s => s.type === "bearish").length;
  const warning = signals.filter(s => s.type === "warning").length;

  // Score: bullish = +10, warning = -3, bearish = -8, base 50, clamp 0-100
  const raw = 50 + (bullish * 10) - (warning * 3) - (bearish * 8);
  const score = Math.max(0, Math.min(100, raw));

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
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Thesis Score</p>
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
      <div className="flex items-center gap-3 mt-2 font-mono text-[10px]">
        <span className="text-terminal-green">✓ {bullish} bullish</span>
        <span className="text-terminal-amber">⚠ {warning} watch</span>
        <span className="text-terminal-red">✗ {bearish} bearish</span>
      </div>
    </div>
  );
}
