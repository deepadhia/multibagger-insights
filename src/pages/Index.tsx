import { DashboardLayout } from "@/components/DashboardLayout";
import { StatsCard } from "@/components/StatsCard";
import { SentimentBadge } from "@/components/SentimentBadge";
import { ToneBadge } from "@/components/ToneBadge";
import { useStocks, useAllAnalysis } from "@/hooks/useStocks";
import { BarChart3, TrendingUp, FileText, Target, Activity, ArrowUpRight, ArrowDownRight, RefreshCw, Loader2, Zap } from "lucide-react";
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
        .select("stock_id, date, price, volume")
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

const MAX_DATE_GAP_DAYS = 45;

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

  const getPriceNearDate = (series: Array<{ date: string; price: number }>, targetDate: Date): number | null => {
    const targetTs = targetDate.getTime();

    for (const item of series) {
      const itemTs = new Date(item.date).getTime();
      if (itemTs <= targetTs) {
        const diffDays = (targetTs - itemTs) / (1000 * 60 * 60 * 24);
        return diffDays <= MAX_DATE_GAP_DAYS ? item.price : null;
      }
    }

    return null;
  };

  // Calculate returns for each stock
  const stockReturns = useMemo(() => {
    if (!stocks || !allPrices || allPrices.length === 0) return [];

    const now = new Date();
    const oneMonthAgo = new Date(now); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    return stocks.map(stock => {
      const prices = allPrices
        .filter(p => p.stock_id === stock.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (prices.length === 0) return { stock, latestPrice: null, return1m: null, return3m: null, return1y: null, return2y: null, return3y: null, volumeSpike: false };

      const latestPrice = prices[0].price;
      const latestVolume = (prices[0] as any).volume;

      // Calculate avg volume over last 20 trading days
      const recentVolumes = prices.slice(1, 21).map(p => (p as any).volume).filter((v: any) => v != null && v > 0);
      const avgVolume = recentVolumes.length > 0 ? recentVolumes.reduce((s: number, v: number) => s + v, 0) / recentVolumes.length : 0;
      const volumeSpike = latestVolume && avgVolume > 0 && latestVolume > avgVolume * 2;

      const calcReturn = (old: number | null | undefined) =>
        old && old > 0 ? Math.round(((latestPrice - old) / old) * 1000) / 10 : null;

      // Check for sudden price movement (>3% in last day)
      const prevPrice = prices.length > 1 ? prices[1].price : null;
      const dailyChange = prevPrice && prevPrice > 0 ? Math.abs(((latestPrice - prevPrice) / prevPrice) * 100) : 0;
      const suddenMove = dailyChange > 3;

      return {
        stock,
        latestPrice,
        return1m: calcReturn(getPriceNearDate(prices as Array<{ date: string; price: number }>, oneMonthAgo)),
        return3m: calcReturn(getPriceNearDate(prices as Array<{ date: string; price: number }>, threeMonthsAgo)),
        return1y: calcReturn(getPriceNearDate(prices as Array<{ date: string; price: number }>, oneYearAgo)),
        return2y: calcReturn(getPriceNearDate(prices as Array<{ date: string; price: number }>, twoYearsAgo)),
        return3y: calcReturn(getPriceNearDate(prices as Array<{ date: string; price: number }>, threeYearsAgo)),
        volumeSpike: volumeSpike || suddenMove,
      };
    }).sort((a, b) => (b.return1m ?? -999) - (a.return1m ?? -999));
  }, [stocks, allPrices]);

  // Nifty sector index performance
  const niftySectorPerformance = useMemo(() => {
    if (!sectorIndicesData || sectorIndicesData.length === 0) return [];

    const now = new Date();
    const oneMonthAgo = new Date(now); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    const byIndex: Record<string, Array<{ date: string; price: number; index_name: string; sector: string }>> = {};
    for (const row of sectorIndicesData) {
      if (!byIndex[row.index_symbol]) byIndex[row.index_symbol] = [];
      byIndex[row.index_symbol].push({ date: row.date, price: Number(row.price), index_name: row.index_name, sector: row.sector });
    }

    return Object.entries(byIndex).map(([symbol, prices]) => {
      prices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = prices[0];
      const latestPrice = latest.price;

      const calc = (old: number | null | undefined) =>
        old && old > 0 ? Math.round(((latestPrice - old) / old) * 1000) / 10 : null;

      // Detect sudden move (>2% daily change)
      const prevPrice = prices.length > 1 ? prices[1].price : null;
      const dailyChange = prevPrice && prevPrice > 0 ? ((latestPrice - prevPrice) / prevPrice) * 100 : 0;
      const suddenMove = Math.abs(dailyChange) > 2;

      return {
        name: latest.index_name,
        sector: latest.sector,
        latestPrice,
        return1m: calc(getPriceNearDate(prices, oneMonthAgo)),
        return3m: calc(getPriceNearDate(prices, threeMonthsAgo)),
        return1y: calc(getPriceNearDate(prices, oneYearAgo)),
        return2y: calc(getPriceNearDate(prices, twoYearsAgo)),
        return3y: calc(getPriceNearDate(prices, threeYearsAgo)),
        suddenMove,
        dailyChange: Math.round(dailyChange * 10) / 10,
      };
    }).sort((a, b) => (b.return1m ?? -999) - (a.return1m ?? -999));
  }, [sectorIndicesData]);

  const handleRefreshSectorIndices = async () => {
    setRefreshingSectors(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-sector-indices");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["sector-indices"] });
      toast({ title: "Sector indices updated", description: data?.message });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setRefreshingSectors(false);
  };

  // Sentiment chart data
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Total Stocks" value={totalStocks} icon={BarChart3} subtitle={`${coreStocks} Core • ${starterStocks} Starter`} />
          <StatsCard title="Avg Sentiment" value={avgSentiment} icon={TrendingUp} trend={Number(avgSentiment) >= 7 ? "up" : Number(avgSentiment) >= 4 ? "neutral" : "down"} />
          <StatsCard title="Analyses" value={analyses?.length || 0} icon={FileText} />
          <StatsCard title="Watchlist" value={watchlistStocks} icon={Target} />
        </div>

        {stockReturns.length > 0 && stockReturns.some(sr => sr.latestPrice) && (
          <Card className="p-4 bg-card border-border card-glow overflow-hidden">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">Stock Returns</h3>
            <div className="overflow-x-auto">
              <table className="w-full data-grid">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Stock</th>
                    <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Sector</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">CMP (₹)</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">1M</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">3M</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">1Y</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">2Y</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">3Y</th>
                    <th className="text-center p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReturns.map(({ stock, latestPrice, return1m, return3m, return1y, return2y, return3y, volumeSpike }) => (
                    <tr key={stock.id} className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer ${volumeSpike ? "bg-terminal-amber/5 border-l-2 border-l-terminal-amber" : ""}`} onClick={() => navigate(`/stocks/${stock.id}`)}>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          {volumeSpike && <Zap className="h-3 w-3 text-terminal-amber shrink-0" />}
                          <span className="font-mono text-sm font-semibold text-foreground">{stock.ticker}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">{stock.company_name}</span>
                        </div>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{stock.sector || "—"}</td>
                      <td className="p-2 text-right font-mono text-foreground text-sm">{latestPrice ? `₹${Number(latestPrice).toLocaleString()}` : "—"}</td>
                      <td className="p-2 text-right"><ReturnBadge value={return1m} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return3m} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return1y} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return2y} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return3y} /></td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className={`font-mono text-[10px] ${stock.category === "Core" ? "text-terminal-green border-terminal-green/30" : stock.category === "Starter" ? "text-terminal-cyan border-terminal-cyan/30" : "text-muted-foreground border-border"}`}>{stock.category}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card className="p-4 bg-card border-border card-glow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Nifty Sector Indices</h3>
            <Button variant="ghost" size="sm" onClick={handleRefreshSectorIndices} disabled={refreshingSectors} className="font-mono text-xs h-7 px-2">
              {refreshingSectors ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
          {niftySectorPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full data-grid">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Index</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Price</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">1M</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">3M</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">1Y</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">2Y</th>
                    <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">3Y</th>
                  </tr>
                </thead>
                <tbody>
                  {niftySectorPerformance.map(({ name, latestPrice, return1m, return3m, return1y, return2y, return3y, suddenMove, dailyChange }) => (
                    <tr key={name} className={`border-b border-border/50 ${suddenMove ? "bg-terminal-amber/5 border-l-2 border-l-terminal-amber" : ""}`}>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          {suddenMove && <Zap className="h-3 w-3 text-terminal-amber shrink-0" />}
                          <span className="font-mono text-xs font-semibold text-foreground">{name}</span>
                          {suddenMove && <span className={`text-[9px] font-mono ${dailyChange >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>({dailyChange > 0 ? "+" : ""}{dailyChange}% today)</span>}
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono text-xs text-muted-foreground">{latestPrice?.toLocaleString()}</td>
                      <td className="p-2 text-right"><ReturnBadge value={return1m} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return3m} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return1y} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return2y} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return3y} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground font-mono text-sm">Click refresh to fetch Nifty sector data</div>
          )}
        </Card>

        <Card className="p-4 bg-card border-border card-glow">
          <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">Sentiment by Stock</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" domain={[0, 10]} tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: "hsl(220 18% 9%)", border: "1px solid hsl(220 14% 16%)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                <Bar dataKey="sentiment" radius={[0, 4, 4, 0]} barSize={20}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.sentiment >= 7 ? "hsl(142 70% 45%)" : entry.sentiment >= 4 ? "hsl(45 90% 55%)" : "hsl(0 72% 50%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-muted-foreground font-mono text-sm">No analysis data yet. Upload a transcript to begin.</div>
          )}
        </Card>

        <Card className="p-4 bg-card border-border card-glow">
          <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">Latest Insights</h3>
          {latestAnalyses.length > 0 ? (
            <div className="space-y-3">
              {latestAnalyses.map((a) => (
                <div key={a.id} className="p-3 bg-muted rounded-md border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-semibold text-foreground">{(a as any).stocks?.ticker || "—"} • {a.quarter}</span>
                    <div className="flex items-center gap-2">
                      {a.management_tone && <ToneBadge tone={a.management_tone} />}
                      {a.sentiment_score && <SentimentBadge score={a.sentiment_score} />}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{a.analysis_summary || "Analysis pending..."}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-muted-foreground font-mono text-sm">No insights yet. Add stocks and upload transcripts.</div>
          )}
        </Card>

        <div className="flex gap-3">
          <button onClick={() => navigate("/stocks")} className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md font-mono text-sm text-foreground border border-border transition-colors">
            <Activity className="inline h-4 w-4 mr-2" />Manage Stocks
          </button>
          <button onClick={() => navigate("/transcripts")} className="px-4 py-2 bg-primary/10 hover:bg-primary/20 rounded-md font-mono text-sm text-primary border border-primary/20 transition-colors">
            <FileText className="inline h-4 w-4 mr-2" />Upload Transcript
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
