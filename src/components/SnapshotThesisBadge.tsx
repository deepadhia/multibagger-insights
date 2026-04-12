import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown, Minus, TrendingDown } from "lucide-react";

/** Lowercase thesis from quarterly_snapshots / Gemini JSON (strengthening, stable, …). */
export function SnapshotThesisBadge({ thesisStatus }: { thesisStatus: string | null | undefined }) {
  const s = (thesisStatus || "").toLowerCase().trim();
  if (!s) {
    return <span className="text-[10px] text-muted-foreground font-mono">—</span>;
  }
  const config =
    s === "strengthening"
      ? { label: "strengthening", color: "text-terminal-green border-terminal-green/30", Icon: ChevronUp }
      : s === "weakening"
        ? { label: "weakening", color: "text-terminal-amber border-terminal-amber/30", Icon: ChevronDown }
        : s === "broken"
          ? { label: "broken", color: "text-terminal-red border-terminal-red/30", Icon: TrendingDown }
          : s === "stable"
            ? { label: "stable", color: "text-muted-foreground border-border", Icon: Minus }
            : { label: s, color: "text-muted-foreground border-border", Icon: Minus };
  const { label, color, Icon } = config;
  return (
    <Badge variant="outline" className={`font-mono text-[10px] gap-1 capitalize shrink-0 ${color}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
