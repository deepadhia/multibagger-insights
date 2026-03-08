import { DashboardLayout } from "@/components/DashboardLayout";
import { StatsCard } from "@/components/StatsCard";
import { SentimentBadge } from "@/components/SentimentBadge";
import { ToneBadge } from "@/components/ToneBadge";
import { useStocks, useAllAnalysis } from "@/hooks/useStocks";
import { BarChart3, TrendingUp, FileText, Target, Activity, ArrowUpRight, ArrowDownRight, RefreshCw, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";

function useAllPrices() {
  return useQuery({
    queryKey: ["all-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prices")
        .select("stock_id, date, price")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useSectorIndices() {
  return useQuery({
    queryKey: ["sector-indices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sector_indices")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

const Index = () => {
  const { data: stocks } = useStocks();
  const { data: analyses } = useAllAnalysis();
  const { data: allPrices } = useAllPrices();
  const { data: sectorIndicesData } = useSectorIndices();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [refreshingSectors, setRefreshingSectors] = useState(false);

  const totalStocks = stocks?.length || 0;
  const coreStocks = stocks?.filter(s => s.category === "Core").length || 0;
  const starterStocks = stocks?.filter(s => s.category === "Starter").length || 0;
  const watchlistStocks = stocks?.filter(s => s.category === "Watchlist").length || 0;

  const avgSentiment = analyses?.length
    ? (analyses.reduce((sum, a) => sum + (a.sentiment_score || 0), 0) / analyses.length).toFixed(1)
    : "—";

  const latestAnalyses = analyses?.slice(0, 5) || [];

  // Calculate returns for each stock
  const stockReturns = useMemo(() => {
    if (!stocks || !allPrices || allPrices.length === 0) return [];

    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    return stocks.map(stock => {
      const prices = allPrices
        .filter(p => p.stock_id === stock.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (prices.length === 0) return { stock, latestPrice: null, return1m: null, return3m: null, return1y: null };

      const latestPrice = prices[0].price;

      const findClosestPrice = (targetDate: Date) => {
        let closest = prices[prices.length - 1];
        for (const p of prices) {
          if (new Date(p.date) <= targetDate) {
            closest = p;
            break;
          }
        }
        return closest?.price;
      };

      const price1m = findClosestPrice(oneMonthAgo);
      const price3m = findClosestPrice(threeMonthsAgo);
      const price1y = findClosestPrice(oneYearAgo);

      const calcReturn = (old: number | null | undefined) =>
        old && old > 0 ? Math.round(((latestPrice - old) / old) * 1000) / 10 : null;

      return {
        stock,
        latestPrice,
        return1m: calcReturn(price1m),
        return3m: calcReturn(price3m),
        return1y: calcReturn(price1y),
      };
    }).sort((a, b) => (b.return1m ?? -999) - (a.return1m ?? -999));
  }, [stocks, allPrices]);

  // Sector performance
  const sectorPerformance = useMemo(() => {
    if (!stockReturns.length) return [];

    const sectorMap: Record<string, { returns1m: number[]; returns3m: number[]; returns1y: number[] }> = {};

    for (const sr of stockReturns) {
      const sector = sr.stock.sector || "Unknown";
      if (!sectorMap[sector]) sectorMap[sector] = { returns1m: [], returns3m: [], returns1y: [] };
      if (sr.return1m !== null) sectorMap[sector].returns1m.push(sr.return1m);
      if (sr.return3m !== null) sectorMap[sector].returns3m.push(sr.return3m);
      if (sr.return1y !== null) sectorMap[sector].returns1y.push(sr.return1y);
    }

    return Object.entries(sectorMap)
      .map(([sector, data]) => ({
        sector,
        avg1m: data.returns1m.length ? Math.round(data.returns1m.reduce((s, v) => s + v, 0) / data.returns1m.length * 10) / 10 : null,
        avg3m: data.returns3m.length ? Math.round(data.returns3m.reduce((s, v) => s + v, 0) / data.returns3m.length * 10) / 10 : null,
        avg1y: data.returns1y.length ? Math.round(data.returns1y.reduce((s, v) => s + v, 0) / data.returns1y.length * 10) / 10 : null,
        count: new Set([...data.returns1m, ...data.returns3m, ...data.returns1y]).size || 1,
      }))
      .sort((a, b) => (b.avg1m ?? -999) - (a.avg1m ?? -999));
  }, [stockReturns]);

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

  const ReturnBadge = ({ value }: { value: number | null }) => {
    if (value === null) return <span className="font-mono text-muted-foreground text-xs">—</span>;
    const isPositive = value >= 0;
    return (
      <span className={`font-mono text-xs font-semibold flex items-center gap-0.5 ${isPositive ? "text-terminal-green" : "text-terminal-red"}`}>
        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(value)}%
      </span>
    );
  };

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

        {/* Stock Returns Table */}
        {stockReturns.length > 0 && stockReturns.some(sr => sr.latestPrice) && (
          <Card className="p-4 bg-card border-border card-glow overflow-hidden">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
              Stock Returns
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full data-grid">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Stock</th>
                    <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Sector</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">CMP (₹)</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">1M Return</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">3M Return</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">1Y Return</th>
                    <th className="text-center p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReturns.map(({ stock, latestPrice, return1m, return3m, return1y }) => (
                    <tr
                      key={stock.id}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/stocks/${stock.id}`)}
                    >
                      <td className="p-2">
                        <span className="font-mono text-sm font-semibold text-foreground">{stock.ticker}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">{stock.company_name}</span>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{stock.sector || "—"}</td>
                      <td className="p-2 text-right font-mono text-foreground text-sm">
                        {latestPrice ? `₹${Number(latestPrice).toLocaleString()}` : "—"}
                      </td>
                      <td className="p-2 text-right"><ReturnBadge value={return1m} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return3m} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return1y} /></td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className={`font-mono text-[10px] ${
                          stock.category === "Core" ? "text-terminal-green border-terminal-green/30" :
                          stock.category === "Starter" ? "text-terminal-cyan border-terminal-cyan/30" :
                          "text-muted-foreground border-border"
                        }`}>{stock.category}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sector Performance */}
          {sectorPerformance.length > 0 && (
            <Card className="p-4 bg-card border-border card-glow">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
                Sector Performance
              </h3>
              <div className="space-y-2">
                {sectorPerformance.map(({ sector, avg1m, avg3m, avg1y }) => (
                  <div key={sector} className="p-3 bg-muted rounded border border-border/50 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-semibold text-foreground">{sector}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground font-mono mb-0.5">1M</p>
                        <ReturnBadge value={avg1m} />
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground font-mono mb-0.5">3M</p>
                        <ReturnBadge value={avg3m} />
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground font-mono mb-0.5">1Y</p>
                        <ReturnBadge value={avg1y} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

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
