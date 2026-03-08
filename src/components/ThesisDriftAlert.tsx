import { AlertTriangle } from "lucide-react";

interface Props {
  driftStatus: string | null;
  driftReason: string | null;
}

export function ThesisDriftAlert({ driftStatus, driftReason }: Props) {
  if (!driftStatus || driftStatus === "none") return null;

  const isConfirmed = driftStatus === "confirmed";

  return (
    <div className={`p-4 rounded-lg border-l-4 ${
      isConfirmed
        ? "bg-terminal-red/10 border-terminal-red"
        : "bg-terminal-amber/10 border-terminal-amber"
    }`}>
      <h3 className={`font-mono text-xs font-bold flex items-center gap-2 ${
        isConfirmed ? "text-terminal-red" : "text-terminal-amber"
      }`}>
        <AlertTriangle className="h-4 w-4" />
        THESIS DRIFT: {driftStatus.toUpperCase()}
      </h3>
      {driftReason && (
        <p className="text-sm mt-1.5 text-foreground/80">{driftReason}</p>
      )}
    </div>
  );
}
