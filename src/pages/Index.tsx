import { DashboardLayout } from "@/components/DashboardLayout";
import { useStocks, useAllAnalysis } from "@/hooks/useStocks";
import { useAllFinancialMetrics, useAllShareholding, useAllSnapshots, useAllPromises, useAllCommitments } from "@/hooks/usePortfolioData";
import { detectMultibaggerSignals, calculateThesisScore, getThesisStatus, type Signal, type ThesisStatus } from "@/lib/signals";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, TrendingUp, TrendingDown, FileText, Target, Activity,
  ArrowUpRight, ArrowDownRight, RefreshCw, Loader2, Zap, CalendarClock,
  Shield, AlertTriangle, ArrowRight, ChevronUp, ChevronDown, Minus
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

function useAllPrices() {
  return useQuery({
    queryKey: ["all-prices"],
    queryFn: async () => {
      // Paginate to get all prices (Supabase default limit is 1000)
      const allData: any[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("prices")
          .select("stock_id, date, price, volume")
          .order("date", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allData;
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

const ThesisStatusBadge = ({ status }: { status: ThesisStatus }) => {
  const config = {
    Strengthening: { color: "text-terminal-green border-terminal-green/30 bg-terminal-green/10", icon: ChevronUp },
    Stable: { color: "text-muted-foreground border-border bg-muted/50", icon: Minus },
    Weakening: { color: "text-terminal-amber border-terminal-amber/30 bg-terminal-amber/10", icon: ChevronDown },
    Broken: { color: "text-terminal-red border-terminal-red/30 bg-terminal-red/10", icon: TrendingDown },
  }[status.status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`font-mono text-[10px] gap-1 ${config.color}`}>
      <Icon className="h-3 w-3" />
      {status.status}
    </Badge>
  );
};

const Index = () => {
  const { data: stocks } = useStocks();
  const { data: analyses } = useAllAnalysis();
  const { data: allPrices } = useAllPrices();
  const { data: sectorIndicesData } = useSectorIndices();
  const { data: allFinancials } = useAllFinancialMetrics();
  const { data: allShareholding } = useAllShareholding();
  const { data: allSnapshots } = useAllSnapshots();
  const { data: allPromises } = useAllPromises();
  const { data: allCommitments } = useAllCommitments();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [refreshingSectors, setRefreshingSectors] = useState(false);

  // ── Compute signals & thesis status for each stock ──
  const stockSignals = useMemo(() => {
    if (!stocks) return [];
    return stocks.map(stock => {
      const financials = (allFinancials || []).filter(f => f.stock_id === stock.id);
      const shareholding = (allShareholding || []).filter(s => s.stock_id === stock.id);
      const snapshots = (allSnapshots || []).filter(s => s.stock_id === stock.id);
      const promises = (allPromises || []).filter(p => p.stock_id === stock.id);
      const commitments = (allCommitments || []).filter(c => c.stock_id === stock.id);
      const stockAnalyses = (analyses || []).filter(a => (a as any).stock_id === stock.id);
      const latestAnalysis = stockAnalyses[0];

      const signals = detectMultibaggerSignals(financials, latestAnalysis, commitments, shareholding, promises, snapshots, stockAnalyses);
      const score = calculateThesisScore(signals);
      const thesisStatus = getThesisStatus(signals, score);

      return { stock, signals, score, thesisStatus };
    });
  }, [stocks, allFinancials, allShareholding, allSnapshots, allPromises, allCommitments, analyses]);

  // ── Portfolio metrics ──
  const avgScore = stockSignals.length > 0
    ? Math.round(stockSignals.reduce((s, ss) => s + ss.score, 0) / stockSignals.length)
    : 0;
  const strengthening = stockSignals.filter(s => s.thesisStatus.status === "Strengthening").length;
  const weakening = stockSignals.filter(s => s.thesisStatus.status === "Weakening").length;
  const broken = stockSignals.filter(s => s.thesisStatus.status === "Broken").length;

  // Upcoming results
  const upcomingResults = useMemo(() => {
    return (stocks || [])
      .filter(s => s.next_results_date)
      .map(s => {
        const resultsDate = new Date(s.next_results_date!);
        const now = new Date();
        const diffDays = Math.ceil((resultsDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { ...s, resultsDate, diffDays };
      })
      .filter(s => s.diffDays >= -1 && s.diffDays <= 7)
      .sort((a, b) => a.resultsDate.getTime() - b.resultsDate.getTime());
  }, [stocks]);

  // Action alerts: collect bearish signals across portfolio
  const actionAlerts = useMemo(() => {
    const alerts: { stock: any; signal: Signal; score: number }[] = [];
    stockSignals.forEach(({ stock, signals, score }) => {
      signals
        .filter(s => s.type === "bearish" || s.type === "warning")
        .forEach(signal => alerts.push({ stock, signal, score }));
    });
    // Sort: bearish first, then warning
    alerts.sort((a, b) => (a.signal.type === "bearish" ? 0 : 1) - (b.signal.type === "bearish" ? 0 : 1));
    return alerts.slice(0, 10);
  }, [stockSignals]);

  // ── Price returns ──
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

  const stockReturns = useMemo(() => {
    if (!stocks || !allPrices || allPrices.length === 0) return [];
    const now = new Date();
    const oneMonthAgo = new Date(now); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    return stocks.map(stock => {
      const prices = allPrices.filter(p => p.stock_id === stock.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (prices.length === 0) return { stock, latestPrice: null, return1m: null, return3m: null, return6m: null, return1y: null, return2y: null, return3y: null, volumeSpike: false };
      const latestPrice = prices[0].price;
      const latestVolume = (prices[0] as any).volume;
      const recentVolumes = prices.slice(1, 21).map(p => (p as any).volume).filter((v: any) => v != null && v > 0);
      const avgVolume = recentVolumes.length > 0 ? recentVolumes.reduce((s: number, v: number) => s + v, 0) / recentVolumes.length : 0;
      const volumeSpike = latestVolume && avgVolume > 0 && latestVolume > avgVolume * 2;
      const calcReturn = (old: number | null | undefined) => old && old > 0 ? Math.round(((latestPrice - old) / old) * 1000) / 10 : null;
      const prevPrice = prices.length > 1 ? prices[1].price : null;
      const dailyChange = prevPrice && prevPrice > 0 ? Math.abs(((latestPrice - prevPrice) / prevPrice) * 100) : 0;
      return {
        stock, latestPrice,
        return1m: calcReturn(getPriceNearDate(prices as any, oneMonthAgo)),
        return3m: calcReturn(getPriceNearDate(prices as any, threeMonthsAgo)),
        return6m: calcReturn(getPriceNearDate(prices as any, sixMonthsAgo)),
        return1y: calcReturn(getPriceNearDate(prices as any, oneYearAgo)),
        return2y: calcReturn(getPriceNearDate(prices as any, twoYearsAgo)),
        return3y: calcReturn(getPriceNearDate(prices as any, threeYearsAgo)),
        volumeSpike: volumeSpike || dailyChange > 3,
      };
    }).sort((a, b) => (b.return1m ?? -999) - (a.return1m ?? -999));
  }, [stocks, allPrices]);

  // Sector indices
  const niftySectorPerformance = useMemo(() => {
    if (!sectorIndicesData || sectorIndicesData.length === 0) return [];
    const now = new Date();
    const oneMonthAgo = new Date(now); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const byIndex: Record<string, Array<{ date: string; price: number; index_name: string }>> = {};
    for (const row of sectorIndicesData) {
      if (!byIndex[row.index_symbol]) byIndex[row.index_symbol] = [];
      byIndex[row.index_symbol].push({ date: row.date, price: Number(row.price), index_name: row.index_name });
    }
    return Object.entries(byIndex).map(([, prices]) => {
      prices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = prices[0];
      const calc = (old: number | null | undefined) => old && old > 0 ? Math.round(((latest.price - old) / old) * 1000) / 10 : null;
      const prevPrice = prices.length > 1 ? prices[1].price : null;
      const dailyChange = prevPrice && prevPrice > 0 ? ((latest.price - prevPrice) / prevPrice) * 100 : 0;
      return {
        name: latest.index_name, latestPrice: latest.price,
        return1m: calc(getPriceNearDate(prices, oneMonthAgo)),
        return3m: calc(getPriceNearDate(prices, threeMonthsAgo)),
        return1y: calc(getPriceNearDate(prices, oneYearAgo)),
        suddenMove: Math.abs(dailyChange) > 2,
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

  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-terminal-green";
    if (score >= 55) return "text-terminal-green/80";
    if (score >= 40) return "text-terminal-amber";
    return "text-terminal-red";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold text-primary terminal-glow">
            Portfolio Command Center
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            What requires your attention today?
          </p>
        </div>

        {/* ── TOP CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="p-4 bg-card border-border card-glow text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Avg Thesis Score</p>
            <p className={`text-3xl font-mono font-bold ${getScoreColor(avgScore)}`}>{avgScore}</p>
          </Card>
          <Card className="p-4 bg-card border-border card-glow text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Strengthening</p>
            <p className="text-3xl font-mono font-bold text-terminal-green">{strengthening}</p>
          </Card>
          <Card className="p-4 bg-card border-border card-glow text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Weakening</p>
            <p className="text-3xl font-mono font-bold text-terminal-amber">{weakening}</p>
          </Card>
          <Card className="p-4 bg-card border-border card-glow text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Broken</p>
            <p className="text-3xl font-mono font-bold text-terminal-red">{broken}</p>
          </Card>
          <Card className="p-4 bg-card border-border card-glow text-center">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Results This Week</p>
            <p className={`text-3xl font-mono font-bold ${upcomingResults.length > 0 ? "text-terminal-amber" : "text-muted-foreground"}`}>{upcomingResults.length}</p>
          </Card>
        </div>

        {/* ── UPCOMING RESULTS ── */}
        {upcomingResults.length > 0 && (
          <Card className="p-3 bg-card border-border card-glow">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 shrink-0">
                <CalendarClock className="h-4 w-4 text-primary" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Upcoming Results</span>
              </div>
              <div className="flex items-center gap-4 overflow-x-auto">
                {upcomingResults.map(s => {
                  const isToday = s.diffDays === 0;
                  return (
                    <div key={s.id} onClick={() => navigate(`/stocks/${s.id}`)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 shrink-0 ${
                        isToday ? "border-terminal-red/50 bg-terminal-red/5 animate-pulse" : "border-terminal-amber/40 bg-terminal-amber/5"
                      }`}>
                      <span className="font-mono text-xs font-semibold text-foreground">{s.ticker}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {s.resultsDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      <Badge variant="outline" className={`font-mono text-[9px] px-1.5 py-0 ${isToday ? "text-terminal-red border-terminal-red/40" : "text-terminal-amber border-terminal-amber/30"}`}>
                        {isToday ? "TODAY" : `${s.diffDays}d`}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* ── ACTION ALERTS ── */}
        {actionAlerts.length > 0 && (
          <Card className="p-4 bg-card border-border card-glow">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-terminal-red" />
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Action Alerts</h3>
            </div>
            <div className="space-y-1.5">
              {actionAlerts.map((alert, i) => (
                <div key={i} onClick={() => navigate(`/stocks/${alert.stock.id}`)}
                  className={`flex items-center justify-between px-3 py-2 rounded-md border cursor-pointer transition-colors hover:bg-muted/50 ${
                    alert.signal.type === "bearish"
                      ? "border-l-2 border-l-terminal-red border-border"
                      : "border-l-2 border-l-terminal-amber border-border"
                  }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold text-primary shrink-0">{alert.stock.ticker}</span>
                    <span className="text-xs text-foreground truncate">{alert.signal.label}</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── THESIS STATUS PER STOCK ── */}
        <Card className="p-4 bg-card border-border card-glow overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Thesis Status</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full data-grid">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Stock</th>
                  <th className="text-center p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Score</th>
                  <th className="text-center p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Status</th>
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Reason</th>
                  <th className="text-center p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Signals</th>
                </tr>
              </thead>
              <tbody>
                {stockSignals
                  .sort((a, b) => {
                    const order = { Broken: 0, Weakening: 1, Stable: 2, Strengthening: 3 };
                    return order[a.thesisStatus.status] - order[b.thesisStatus.status];
                  })
                  .map(({ stock, signals, score, thesisStatus }) => {
                    const bullish = signals.filter(s => s.type === "bullish").length;
                    const warning = signals.filter(s => s.type === "warning").length;
                    const bearish = signals.filter(s => s.type === "bearish").length;
                    return (
                      <tr key={stock.id} onClick={() => navigate(`/stocks/${stock.id}`)}
                        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                        <td className="p-2">
                          <div>
                            <span className="font-mono text-sm font-semibold text-primary">{stock.ticker}</span>
                            <span className="text-[10px] text-muted-foreground ml-2">{stock.investment_thesis || ""}</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <span className={`font-mono text-lg font-bold ${getScoreColor(score)}`}>{score}</span>
                        </td>
                        <td className="p-2 text-center">
                          <ThesisStatusBadge status={thesisStatus} />
                        </td>
                        <td className="p-2">
                          <span className="text-xs text-muted-foreground">{thesisStatus.reason}</span>
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-2 font-mono text-[10px]">
                            <span className="text-terminal-green">✓{bullish}</span>
                            <span className="text-terminal-amber">⚠{warning}</span>
                            <span className="text-terminal-red">✗{bearish}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── STOCK RETURNS ── */}
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
                     <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">6M</th>
                     <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">1Y</th>
                     <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">2Y</th>
                     <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">3Y</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReturns.map(({ stock, latestPrice, return1m, return3m, return6m, return1y, return2y, return3y, volumeSpike }) => (
                     <tr key={stock.id} className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer ${volumeSpike ? "bg-terminal-amber/5 border-l-2 border-l-terminal-amber" : ""}`} onClick={() => navigate(`/stocks/${stock.id}`)}>
                       <td className="p-2">
                         <div className="flex items-center gap-1.5">
                           {volumeSpike && <Zap className="h-3 w-3 text-terminal-amber shrink-0" />}
                           <span className="font-mono text-sm font-semibold text-foreground">{stock.ticker}</span>
                         </div>
                       </td>
                       <td className="p-2 text-xs text-muted-foreground">{stock.sector || "—"}</td>
                       <td className="p-2 text-right font-mono text-foreground text-sm">{latestPrice ? `₹${Number(latestPrice).toLocaleString()}` : "—"}</td>
                       <td className="p-2 text-right"><ReturnBadge value={return1m} /></td>
                       <td className="p-2 text-right"><ReturnBadge value={return3m} /></td>
                       <td className="p-2 text-right"><ReturnBadge value={return6m} /></td>
                       <td className="p-2 text-right"><ReturnBadge value={return1y} /></td>
                       <td className="p-2 text-right"><ReturnBadge value={return2y} /></td>
                       <td className="p-2 text-right"><ReturnBadge value={return3y} /></td>
                     </tr>
                   ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── SECTOR INDICES ── */}
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
                  </tr>
                </thead>
                <tbody>
                  {niftySectorPerformance.map(({ name, latestPrice, return1m, return3m, return1y, suddenMove, dailyChange }) => (
                    <tr key={name} className={`border-b border-border/50 ${suddenMove ? "bg-terminal-amber/5 border-l-2 border-l-terminal-amber" : ""}`}>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          {suddenMove && <Zap className="h-3 w-3 text-terminal-amber shrink-0" />}
                          <span className="font-mono text-xs font-semibold text-foreground">{name}</span>
                          {suddenMove && <span className={`text-[9px] font-mono ${dailyChange >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>({dailyChange > 0 ? "+" : ""}{dailyChange}%)</span>}
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono text-xs text-muted-foreground">{latestPrice?.toLocaleString()}</td>
                      <td className="p-2 text-right"><ReturnBadge value={return1m} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return3m} /></td>
                      <td className="p-2 text-right"><ReturnBadge value={return1y} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-muted-foreground font-mono text-sm">Click refresh to fetch Nifty sector data</div>
          )}
        </Card>

        {/* ── QUICK ACTIONS ── */}
        <div className="flex gap-3">
          <button onClick={() => navigate("/stocks")} className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md font-mono text-sm text-foreground border border-border transition-colors">
            <Activity className="inline h-4 w-4 mr-2" />Manage Stocks
          </button>
          <button onClick={() => navigate("/signals")} className="px-4 py-2 bg-primary/10 hover:bg-primary/20 rounded-md font-mono text-sm text-primary border border-primary/20 transition-colors">
            <Zap className="inline h-4 w-4 mr-2" />All Signals
          </button>
          <button onClick={() => navigate("/transcripts")} className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-md font-mono text-sm text-foreground border border-border transition-colors">
            <FileText className="inline h-4 w-4 mr-2" />Upload Transcript
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
