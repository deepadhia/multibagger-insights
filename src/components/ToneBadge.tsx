interface ToneBadgeProps {
  tone: string;
}

export function ToneBadge({ tone }: ToneBadgeProps) {
  const getColor = () => {
    switch (tone) {
      case "Bullish": return "bg-terminal-green/20 text-terminal-green border-terminal-green/30";
      case "Cautious": return "bg-terminal-red/20 text-terminal-red border-terminal-red/30";
      default: return "bg-terminal-amber/20 text-terminal-amber border-terminal-amber/30";
    }
  };

  return (
    <span className={`score-badge border ${getColor()}`}>
      {tone}
    </span>
  );
}
