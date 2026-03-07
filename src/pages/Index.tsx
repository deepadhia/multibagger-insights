import { DashboardLayout } from "@/components/DashboardLayout";
import { StatsCard } from "@/components/StatsCard";
import { SentimentBadge } from "@/components/SentimentBadge";
import { ToneBadge } from "@/components/ToneBadge";
import { useStocks, useAllAnalysis } from "@/hooks/useStocks";
import { BarChart3, TrendingUp, FileText, Target, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { data: stocks } = useStocks();
  const { data: analyses } = useAllAnalysis();
  const navigate = useNavigate();

  const totalStocks = stocks?.length || 0;
  const coreStocks = stocks?.filter(s => s.category === "Core").length || 0;
  const starterStocks = stocks?.filter(s => s.category === "Starter").length || 0;
  const watchlistStocks = stocks?.filter(s => s.category === "Watchlist").length || 0;

  const avgSentiment = analyses?.length
    ? (analyses.reduce((sum, a) => sum + (a.sentiment_score || 0), 0) / analyses.length).toFixed(1)
    : "—";

  const latestAnalyses = analyses?.slice(0, 5) || [];

  // Build chart data for sentiment by stock
  const sentimentByStock = analyses?.reduce((acc, a) => {
    const name = (a as any).stocks?.ticker || "Unknown";
    if (!acc[name]) acc[name] = { name, score: 0, count: 0 };
    acc[name].score += a.sentiment_score || 0;
    acc[name].count += 1;
    return acc;
  }, {} as Record<string, { name: string; score: number; count: number }>);

  const chartData = sentimentByStock
    ? Object.values(sentimentByStock).map(d => ({
        name: d.name,
        sentiment: Math.round(d.score / d.count * 10) / 10,
      }))
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold text-primary terminal-glow">
            Portfolio Dashboard
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Multibagger Intelligence Quantified
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Total Stocks" value={totalStocks} icon={BarChart3} subtitle={`${coreStocks} Core • ${starterStocks} Starter`} />
          <StatsCard title="Avg Sentiment" value={avgSentiment} icon={TrendingUp} trend={Number(avgSentiment) >= 7 ? "up" : Number(avgSentiment) >= 4 ? "neutral" : "down"} />
          <StatsCard title="Analyses" value={analyses?.length || 0} icon={FileText} />
          <StatsCard title="Watchlist" value={watchlistStocks} icon={Target} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sentiment Chart */}
          <Card className="p-4 bg-card border-border card-glow">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
              Sentiment by Stock
            </h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(220 18% 9%)", border: "1px solid hsl(220 14% 16%)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                  <Bar dataKey="sentiment" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.sentiment >= 7 ? "hsl(142 70% 45%)" : entry.sentiment >= 4 ? "hsl(45 90% 55%)" : "hsl(0 72% 50%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground font-mono text-sm">
                No analysis data yet. Upload a transcript to begin.
              </div>
            )}
          </Card>

          {/* Latest Insights */}
          <Card className="p-4 bg-card border-border card-glow">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
              Latest Insights
            </h3>
            {latestAnalyses.length > 0 ? (
              <div className="space-y-3">
                {latestAnalyses.map((a) => (
                  <div key={a.id} className="p-3 bg-muted rounded-md border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {(a as any).stocks?.ticker || "—"} • {a.quarter}
                      </span>
                      <div className="flex items-center gap-2">
                        {a.management_tone && <ToneBadge tone={a.management_tone} />}
                        {a.sentiment_score && <SentimentBadge score={a.sentiment_score} />}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {a.analysis_summary || "Analysis pending..."}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground font-mono text-sm">
                No insights yet. Add stocks and upload transcripts.
              </div>
            )}
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3">
          <button onClick={() => navigate("/stocks")} className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md font-mono text-sm text-foreground border border-border transition-colors">
            <Activity className="inline h-4 w-4 mr-2" />
            Manage Stocks
          </button>
          <button onClick={() => navigate("/transcripts")} className="px-4 py-2 bg-primary/10 hover:bg-primary/20 rounded-md font-mono text-sm text-primary border border-primary/20 transition-colors">
            <FileText className="inline h-4 w-4 mr-2" />
            Upload Transcript
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
