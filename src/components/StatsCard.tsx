import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) {
  return (
    <Card className="p-4 card-glow bg-card border-border">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-2xl font-mono font-bold mt-1 text-foreground">{value}</p>
          {subtitle && (
            <p className={`text-xs font-mono mt-1 ${
              trend === "up" ? "text-terminal-green" : 
              trend === "down" ? "text-terminal-red" : 
              "text-muted-foreground"
            }`}>
              {subtitle}
            </p>
          )}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
    </Card>
  );
}
