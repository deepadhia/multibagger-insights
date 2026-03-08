import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Signal {
  label: string;
  type: "bullish" | "warning" | "bearish";
}

interface ThesisScoreProps {
  signals: Signal[];
}

export function ThesisScore({ signals }: ThesisScoreProps) {
  if (signals.length === 0) return null;

  const bullish = signals.filter(s => s.type === "bullish");
  const bearish = signals.filter(s => s.type === "bearish");
  const warning = signals.filter(s => s.type === "warning");

  // Score: bullish = +8, warning = -5, bearish = -12, base 50, clamp 0-100
  const raw = 50 + (bullish.length * 8) - (warning.length * 5) - (bearish.length * 12);
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
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Thesis Score</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs bg-popover border-border p-3">
              <p className="font-mono text-[10px] text-muted-foreground mb-2">Base 50 · Bullish +8 · Warning −5 · Bearish −12</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {bearish.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] font-semibold text-terminal-red mb-0.5">Bearish (−12 each)</p>
                    {bearish.map((s, i) => (
                      <p key={i} className="font-mono text-[10px] text-terminal-red/80 pl-2">✗ {s.label}</p>
                    ))}
                  </div>
                )}
                {warning.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] font-semibold text-terminal-amber mb-0.5">Warning (−5 each)</p>
                    {warning.map((s, i) => (
                      <p key={i} className="font-mono text-[10px] text-terminal-amber/80 pl-2">⚠ {s.label}</p>
                    ))}
                  </div>
                )}
                {bullish.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] font-semibold text-terminal-green mb-0.5">Bullish (+8 each)</p>
                    {bullish.map((s, i) => (
                      <p key={i} className="font-mono text-[10px] text-terminal-green/80 pl-2">✓ {s.label}</p>
                    ))}
                  </div>
                )}
              </div>
              <p className="font-mono text-[10px] text-muted-foreground mt-2 pt-1.5 border-t border-border">
                50 + ({bullish.length}×8) − ({warning.length}×5) − ({bearish.length}×12) = {raw} → <span className={verdict.color}>{score}</span>
              </p>
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
      <div className="flex items-center gap-3 mt-2 font-mono text-[10px]">
        <span className="text-terminal-green">✓ {bullish.length} bullish</span>
        <span className="text-terminal-amber">⚠ {warning.length} watch</span>
        <span className="text-terminal-red">✗ {bearish.length} bearish</span>
      </div>
    </div>
  );
}
