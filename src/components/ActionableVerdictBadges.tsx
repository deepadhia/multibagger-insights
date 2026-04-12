import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ActionableVerdictBadges({
  decision,
  convictionLevel,
  compact = false,
  className,
}: {
  decision: string | null;
  convictionLevel: string | null;
  compact?: boolean;
  className?: string;
}) {
  if (!decision && !convictionLevel) {
    return <span className={cn("text-[10px] text-muted-foreground font-mono", className)}>—</span>;
  }
  const d = String(decision || "");
  return (
    <div className={cn("flex flex-col items-center gap-1", compact ? "gap-0.5" : "gap-1", className)}>
      {decision ? (
        <Badge
          variant="outline"
          className={cn(
            "font-mono text-center leading-tight whitespace-normal max-w-[14rem]",
            compact ? "text-[9px] px-1.5 py-0" : "text-[10px]",
            d.toUpperCase().includes("BUILD")
              ? "text-terminal-green border-terminal-green/40"
              : d.toUpperCase().includes("CUT")
                ? "text-terminal-red border-terminal-red/40"
                : "text-terminal-amber border-terminal-amber/40",
          )}
          title="actionable_verdict.decision from latest quarterly import"
        >
          {decision}
        </Badge>
      ) : null}
      {convictionLevel ? (
        <Badge
          variant="outline"
          className={cn(
            "font-mono text-muted-foreground border-muted-foreground/40",
            compact ? "text-[9px] px-1.5 py-0" : "text-[10px]",
          )}
          title="actionable_verdict.conviction_level"
        >
          {convictionLevel}
        </Badge>
      ) : null}
    </div>
  );
}
