interface SentimentBadgeProps {
  score: number;
  size?: "sm" | "md";
}

export function SentimentBadge({ score, size = "sm" }: SentimentBadgeProps) {
  const getColor = () => {
    if (score >= 7) return "bg-terminal-green/20 text-terminal-green border-terminal-green/30";
    if (score >= 4) return "bg-terminal-amber/20 text-terminal-amber border-terminal-amber/30";
    return "bg-terminal-red/20 text-terminal-red border-terminal-red/30";
  };

  return (
    <span className={`score-badge border ${getColor()} ${size === "md" ? "text-sm px-3 py-1" : ""}`}>
      {score}/10
    </span>
  );
}
