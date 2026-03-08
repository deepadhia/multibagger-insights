import { useState } from "react";
import { useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useStock, useStockAnalysis, useStockCommitments } from "@/hooks/useStocks";
import { useFinancialMetrics, useFinancialResults, useStockPrices, useShareholding } from "@/hooks/useFinancials";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SentimentBadge } from "@/components/SentimentBadge";
import { ToneBadge } from "@/components/ToneBadge";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Loader2, DollarSign, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Target, AlertTriangle, Zap, Quote,
  BarChart3, Activity, Shield, FileText,
} from "lucide-react";

const chartTooltipStyle = {
  background: "hsl(220 18% 9%)",
  border: "1px solid hsl(220 14% 16%)",
  borderRadius: 8,
  fontFamily: "JetBrains Mono",
  fontSize: 11,
  color: "hsl(210 20% 90%)",
};

export default function StockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: stock, isLoading } = useStock(id!);
  const { data: analyses } = useStockAnalysis(id!);
  const { data: commitments } = useStockCommitments(id!);
  const { data: financials } = useFinancialMetrics(id!);
  const { data: quarterlyResults } = useFinancialResults(id!);
  const { data: prices } = useStockPrices(id!);
  const { data: shareholding } = useShareholding(id!);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [fetchingFinancials, setFetchingFinancials] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const handleFetchFinancials = async () => {
    if (!stock) return;
    setFetchingFinancials(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-financials", {
        body: { stock_id: stock.id, ticker: stock.ticker, screener_slug: stock.screener_slug || stock.ticker },
      });
      if (error) throw error;
      if (data?.success === false) {
        toast({ title: "Financials unavailable", description: data.error || `Could not fetch data for ${stock.ticker}`, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["financial-metrics", id] });
      queryClient.invalidateQueries({ queryKey: ["financial-results", id] });
      toast({ title: "Financial data updated", description: `Fetched data for ${stock.ticker}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFetchingFinancials(false);
    }
  };

  const handleFetchPrice = async () => {
    if (!stock) return;
    setFetchingPrice(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-price", {
        body: { ticker: stock.ticker },
      });

      if (error) throw error;

      if (data?.success === false) {
        toast({
          title: "Live price unavailable",
          description: data.message || `Could not fetch live quote for ${stock.ticker} right now.`,
          variant: "destructive",
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["prices", id] });
      toast({ title: "Price updated", description: `${stock.ticker}: ₹${data.price}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFetchingPrice(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      </DashboardLayout>
    );
  }

  if (!stock) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">Stock not found</div>
      </DashboardLayout>
    );
  }

  const latestAnalysis = analyses?.[0];
  const latestFinancial = financials?.[financials.length - 1];
  const latestPrice = prices?.[0];

  // Find latest non-null value for each metric across all years (iterate backwards)
  const latestVal = (key: string) => {
    if (!financials) return null;
    for (let i = financials.length - 1; i >= 0; i--) {
      const v = (financials[i] as any)[key];
      if (v !== null && v !== undefined && v !== 0) return v;
    }
    return null;
  };

  const achievedCount = commitments?.filter(c => c.status === "Achieved").length || 0;
  const totalCommitments = commitments?.length || 0;
  const credibility = totalCommitments > 0 ? Math.round((achievedCount / totalCommitments) * 100) : null;

  // Multibagger signal detection
  const signals = detectMultibaggerSignals(financials || [], latestAnalysis, commitments || []);

  // Chart data
  const sentimentData = analyses?.map(a => ({
    quarter: a.quarter,
    score: a.sentiment_score || 0,
    year: a.year,
  })).reverse() || [];

  const yearlyChartData = financials?.map(f => ({
    year: f.year,
    revenue: (f as any).revenue,
    netProfit: (f as any).net_profit,
    opm: (f as any).opm,
    eps: (f as any).eps,
    roce: f.roce,
    roe: f.roe,
    revGrowth: f.revenue_growth,
    profGrowth: f.profit_growth,
    fcf: f.free_cash_flow,
    de: f.debt_equity,
  })) || [];

  const quarterlyChartData = quarterlyResults?.map(q => ({
    quarter: q.quarter,
    revenue: q.revenue,
    opm: q.ebitda_margin,
  })) || [];

  const priceChartData = prices?.slice().reverse().map(p => ({
    date: p.date,
    price: p.price,
    change: p.change_percent,
  })) || [];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* ── HEADER BAR ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-mono font-bold text-primary terminal-glow">{stock.ticker}</h1>
                <Badge variant="outline" className="font-mono text-[10px]">{stock.category}</Badge>
                {stock.sector && (
                  <Badge variant="secondary" className="font-mono text-[10px]">{stock.sector}</Badge>
                )}
              </div>
              <p className="text-foreground text-sm mt-0.5">{stock.company_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {latestPrice && (
              <div className="flex items-center gap-2 mr-4">
                <span className="text-xl font-mono font-bold text-foreground">₹{Number(latestPrice.price).toLocaleString()}</span>
                {latestPrice.change_percent !== null && (
                  <span className={`flex items-center font-mono text-sm font-semibold ${latestPrice.change_percent >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
                    {latestPrice.change_percent >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {Math.abs(latestPrice.change_percent).toFixed(2)}%
                  </span>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleFetchPrice} disabled={fetchingPrice} className="font-mono text-xs">
              {fetchingPrice ? <Loader2 className="h-3 w-3 animate-spin" /> : <DollarSign className="h-3 w-3" />}
              <span className="ml-1">Price</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleFetchFinancials} disabled={fetchingFinancials} className="font-mono text-xs">
              {fetchingFinancials ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="ml-1">Financials</span>
            </Button>
          </div>
        </div>

        {/* ── TOP RATIOS BAR ── */}
        {financials && financials.length > 0 && (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-1">
            <RatioCard label="ROCE" value={latestVal("roce")} suffix="%" good={(latestVal("roce") ?? 0) >= 15} />
            <RatioCard label="ROE" value={latestVal("roe")} suffix="%" good={(latestVal("roe") ?? 0) >= 15} />
            <RatioCard label="D/E" value={latestVal("debt_equity")} good={(latestVal("debt_equity") ?? 999) <= 1} />
            <RatioCard label="OPM" value={latestVal("opm")} suffix="%" good={(latestVal("opm") ?? 0) >= 15} />
            <RatioCard label="Rev Growth" value={latestVal("revenue_growth")} suffix="%" good={(latestVal("revenue_growth") ?? 0) >= 15} />
            <RatioCard label="Prof Growth" value={latestVal("profit_growth")} suffix="%" good={(latestVal("profit_growth") ?? 0) >= 15} />
            <RatioCard label="EPS" value={latestVal("eps")} good={(latestVal("eps") ?? 0) > 0} />
            <RatioCard label="Promoter %" value={latestVal("promoter_holding")} suffix="%" good={(latestVal("promoter_holding") ?? 0) >= 50} />
          </div>
        )}

        {/* ── MULTIBAGGER SIGNALS ── */}
        {signals.length > 0 && (
          <Card className="p-4 bg-card border-border card-glow">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-terminal-amber" /> Multibagger Signals
            </h3>
            <div className="flex flex-wrap gap-2">
              {signals.map((s, i) => (
                <Badge key={i} variant="outline" className={`font-mono text-[10px] ${
                  s.type === "bullish" ? "text-terminal-green border-terminal-green/30 bg-terminal-green/10" :
                  s.type === "warning" ? "text-terminal-amber border-terminal-amber/30 bg-terminal-amber/10" :
                  "text-terminal-red border-terminal-red/30 bg-terminal-red/10"
                }`}>
                  {s.type === "bullish" ? "✓" : s.type === "warning" ? "⚠" : "✗"} {s.label}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* ── THESIS + BUY PRICE ── */}
        {(stock.investment_thesis || stock.buy_price) && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            {stock.investment_thesis && (
              <Card className="p-4 bg-card border-border card-glow">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> Investment Thesis
                </h3>
                <p className="text-sm text-foreground leading-relaxed">{stock.investment_thesis}</p>
              </Card>
            )}
            {stock.buy_price && (
              <Card className="p-4 bg-card border-border card-glow flex flex-col items-center justify-center min-w-[120px]">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Buy Price</p>
                <p className="text-2xl font-mono font-bold text-foreground">₹{Number(stock.buy_price).toLocaleString()}</p>
                {latestPrice && stock.buy_price && (
                  <p className={`font-mono text-xs mt-1 ${Number(latestPrice.price) >= Number(stock.buy_price) ? "text-terminal-green" : "text-terminal-red"}`}>
                    {((Number(latestPrice.price) - Number(stock.buy_price)) / Number(stock.buy_price) * 100).toFixed(1)}% return
                  </p>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ── MAIN TABBED CONTENT ── */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-card border border-border w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="font-mono text-xs gap-1.5">
              <BarChart3 className="h-3 w-3" /> Overview
            </TabsTrigger>
            <TabsTrigger value="financials" className="font-mono text-xs gap-1.5">
              <Activity className="h-3 w-3" /> Financials
            </TabsTrigger>
            <TabsTrigger value="analysis" className="font-mono text-xs gap-1.5">
              <Zap className="h-3 w-3" /> Analysis
            </TabsTrigger>
            <TabsTrigger value="commitments" className="font-mono text-xs gap-1.5">
              <Shield className="h-3 w-3" /> Commitments
            </TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW TAB ═══ */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Price Chart */}
              <Card className="p-4 bg-card border-border card-glow">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Price History</h3>
                {priceChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={priceChartData}>
                      <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142 70% 45%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(142 70% 45%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                      <XAxis dataKey="date" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Area type="monotone" dataKey="price" stroke="hsl(142 70% 45%)" fill="url(#priceGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState text="No price data. Click 'Price' to fetch." />
                )}
              </Card>

              {/* Revenue & Profit Trend */}
              <Card className="p-4 bg-card border-border card-glow">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Revenue & Profit (Cr)</h3>
                {yearlyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={yearlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                      <XAxis dataKey="year" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <Bar dataKey="revenue" name="Revenue" fill="hsl(200 80% 55%)" radius={[2, 2, 0, 0]} opacity={0.7} />
                      <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="hsl(142 70% 45%)" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState text="No financial data. Click 'Financials' to fetch." />
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ROCE/ROE Trend */}
              {yearlyChartData.some(d => d.roce || d.roe) && (
                <Card className="p-4 bg-card border-border card-glow">
                  <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">ROCE & ROE Trend (%)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={yearlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                      <XAxis dataKey="year" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <ReferenceLine y={15} stroke="hsl(215 15% 35%)" strokeDasharray="3 3" label={{ value: "15%", fill: "hsl(215 15% 40%)", fontSize: 9 }} />
                      <Line type="monotone" dataKey="roce" name="ROCE" stroke="hsl(142 70% 45%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="roe" name="ROE" stroke="hsl(185 80% 55%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Sentiment Trend */}
              <Card className="p-4 bg-card border-border card-glow">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Sentiment Trend (from AI Analysis)</h3>
                {sentimentData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={sentimentData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                      <XAxis dataKey="quarter" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 10]} tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <ReferenceLine y={7} stroke="hsl(142 70% 45%)" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <ReferenceLine y={4} stroke="hsl(0 72% 50%)" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <Line type="monotone" dataKey="score" stroke="hsl(185 80% 55%)" strokeWidth={2} dot={{ fill: "hsl(185 80% 55%)", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState text="No analysis yet. Upload a transcript on the Transcripts page → AI analyzes it automatically." />
                )}
              </Card>
            </div>

            {/* Latest Analysis Summary */}
            {latestAnalysis && (
              <Card className="p-4 bg-card border-border card-glow">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Latest AI Analysis — {latestAnalysis.quarter} {latestAnalysis.year}
                  </h3>
                  <div className="flex gap-2">
                    {latestAnalysis.management_tone && <ToneBadge tone={latestAnalysis.management_tone} />}
                    {latestAnalysis.sentiment_score && <SentimentBadge score={latestAnalysis.sentiment_score} size="md" />}
                  </div>
                </div>
                {latestAnalysis.analysis_summary && (
                  <p className="text-sm text-foreground leading-relaxed">{latestAnalysis.analysis_summary}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-2 italic">
                  ℹ Analysis data comes from AI processing of earnings call transcripts you upload on the Transcripts page.
                </p>
              </Card>
            )}

            {/* Credibility score */}
            {credibility !== null && (
              <Card className="p-4 bg-card border-border card-glow">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Management Credibility</h3>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className={`text-4xl font-mono font-bold ${credibility >= 70 ? "text-terminal-green" : credibility >= 40 ? "text-terminal-amber" : "text-terminal-red"}`}>
                      {credibility}%
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-1">
                      {achievedCount}/{totalCommitments} achieved
                    </p>
                  </div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${credibility >= 70 ? "bg-terminal-green" : credibility >= 40 ? "bg-terminal-amber" : "bg-terminal-red"}`}
                      style={{ width: `${credibility}%` }}
                    />
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ═══ FINANCIALS TAB ═══ */}
          <TabsContent value="financials" className="space-y-4 mt-4">
            {/* Profit & Loss Table */}
            {financials && financials.length > 0 && (
              <Card className="p-4 bg-card border-border card-glow overflow-hidden">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Profit & Loss (₹ Cr)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full data-grid">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Year</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Revenue</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Rev Growth</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Net Profit</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Prof Growth</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">OPM %</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">EPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.map((f) => (
                        <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-2 font-semibold text-foreground">{f.year}</td>
                          <td className="p-2 text-right text-foreground font-mono">
                            {(f as any).revenue != null ? Number((f as any).revenue).toLocaleString() : "—"}
                          </td>
                          <td className="p-2 text-right">
                            <ColoredValue value={f.revenue_growth} suffix="%" goodAbove={15} />
                          </td>
                          <td className="p-2 text-right text-foreground font-mono">
                            {(f as any).net_profit != null ? Number((f as any).net_profit).toLocaleString() : "—"}
                          </td>
                          <td className="p-2 text-right">
                            <ColoredValue value={f.profit_growth} suffix="%" goodAbove={15} />
                          </td>
                          <td className="p-2 text-right">
                            <ColoredValue value={(f as any).opm} suffix="%" goodAbove={15} />
                          </td>
                          <td className="p-2 text-right text-foreground font-mono">
                            {(f as any).eps != null ? (f as any).eps : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Key Ratios Table */}
            {financials && financials.length > 0 && (
              <Card className="p-4 bg-card border-border card-glow overflow-hidden">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Key Ratios</h3>
                <div className="overflow-x-auto">
                  <table className="w-full data-grid">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Year</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">ROCE %</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">ROE %</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">D/E</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">FCF (Cr)</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Promoter %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.map((f) => (
                        <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-2 font-semibold text-foreground">{f.year}</td>
                          <td className="p-2 text-right">
                            <ColoredValue value={f.roce} suffix="%" goodAbove={15} />
                          </td>
                          <td className="p-2 text-right">
                            <ColoredValue value={f.roe} suffix="%" goodAbove={15} />
                          </td>
                          <td className="p-2 text-right">
                            <ColoredValue value={f.debt_equity} goodBelow={1} />
                          </td>
                          <td className="p-2 text-right">
                            <ColoredValue value={f.free_cash_flow} goodAbove={0} />
                          </td>
                          <td className="p-2 text-right">
                            <ColoredValue value={f.promoter_holding} suffix="%" goodAbove={50} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Charts */}
            {yearlyChartData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-4 bg-card border-border card-glow">
                  <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">OPM & EPS Trend</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={yearlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                      <XAxis dataKey="year" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="opm" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="eps" orientation="right" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <Bar yAxisId="eps" dataKey="eps" name="EPS (₹)" fill="hsl(200 80% 55%)" radius={[2, 2, 0, 0]} opacity={0.6} />
                      <Line yAxisId="opm" type="monotone" dataKey="opm" name="OPM %" stroke="hsl(45 90% 55%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-4 bg-card border-border card-glow">
                  <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Growth Trend</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={yearlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                      <XAxis dataKey="year" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <ReferenceLine y={0} stroke="hsl(215 15% 35%)" />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <Bar dataKey="revGrowth" name="Revenue %" fill="hsl(200 80% 55%)" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="profGrowth" name="Profit %" fill="hsl(142 70% 45%)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            {/* Quarterly Results */}
            {quarterlyResults && quarterlyResults.length > 0 && (
              <Card className="p-4 bg-card border-border card-glow overflow-hidden">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Quarterly Results</h3>
                <div className="overflow-x-auto">
                  <table className="w-full data-grid">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Quarter</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Revenue (Cr)</th>
                        <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">OPM %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quarterlyResults.map((q) => (
                        <tr key={q.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-2 font-semibold text-foreground">{q.quarter}</td>
                          <td className="p-2 text-right text-foreground font-mono">
                            {q.revenue !== null ? Number(q.revenue).toLocaleString() : "—"}
                          </td>
                          <td className="p-2 text-right">
                            <ColoredValue value={q.ebitda_margin} suffix="%" goodAbove={15} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Quarterly Chart */}
            {quarterlyChartData.length > 0 && (
              <Card className="p-4 bg-card border-border card-glow">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Quarterly Revenue & OPM</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={quarterlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 16%)" />
                    <XAxis dataKey="quarter" tick={{ fill: "hsl(215 15% 50%)", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={50} />
                    <YAxis yAxisId="rev" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="opm" orientation="right" tick={{ fill: "hsl(215 15% 50%)", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar yAxisId="rev" dataKey="revenue" name="Revenue (Cr)" fill="hsl(200 80% 55%)" radius={[2, 2, 0, 0]} />
                    <Line yAxisId="opm" type="monotone" dataKey="opm" name="OPM %" stroke="hsl(45 90% 55%)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )}

            {(!financials || financials.length === 0) && (!quarterlyResults || quarterlyResults.length === 0) && (
              <EmptyState text="No financial data. Click 'Financials' to fetch from Screener." />
            )}
          </TabsContent>

          {/* ═══ ANALYSIS TAB ═══ */}
          <TabsContent value="analysis" className="space-y-4 mt-4">
            <Card className="p-3 bg-muted/50 border-border rounded">
              <p className="text-xs text-muted-foreground">
                <strong>How it works:</strong> Go to the <strong>Transcripts</strong> page → select this stock → paste an earnings call transcript → AI automatically extracts growth drivers, risks, sentiment, management tone, and commitments.
              </p>
            </Card>

            {latestAnalysis ? (
              <>
                <Card className="p-5 bg-card border-border card-glow">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-mono text-sm font-semibold text-foreground">
                        {latestAnalysis.quarter} {latestAnalysis.year}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">Latest Earnings Analysis</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      {latestAnalysis.management_tone && <ToneBadge tone={latestAnalysis.management_tone} />}
                      {latestAnalysis.sentiment_score && <SentimentBadge score={latestAnalysis.sentiment_score} size="md" />}
                    </div>
                  </div>

                  {latestAnalysis.analysis_summary && (
                    <p className="text-sm text-foreground leading-relaxed mb-5">{latestAnalysis.analysis_summary}</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                    {latestAnalysis.guidance && (
                      <InfoCard icon={<Target className="h-3.5 w-3.5 text-terminal-cyan" />} title="Guidance" text={latestAnalysis.guidance} />
                    )}
                    {latestAnalysis.demand_outlook && (
                      <InfoCard icon={<TrendingUp className="h-3.5 w-3.5 text-terminal-green" />} title="Demand Outlook" text={latestAnalysis.demand_outlook} />
                    )}
                    {latestAnalysis.capacity_expansion && (
                      <InfoCard icon={<BarChart3 className="h-3.5 w-3.5 text-terminal-amber" />} title="Capacity Expansion" text={latestAnalysis.capacity_expansion} />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {latestAnalysis.growth_drivers && (
                      <InsightList title="Growth Drivers" items={latestAnalysis.growth_drivers as string[]} icon={<TrendingUp className="h-3 w-3" />} color="terminal-green" />
                    )}
                    {latestAnalysis.risks && (
                      <InsightList title="Risks" items={latestAnalysis.risks as string[]} icon={<AlertTriangle className="h-3 w-3" />} color="terminal-red" />
                    )}
                    {latestAnalysis.margin_drivers && (
                      <InsightList title="Margin Drivers" items={latestAnalysis.margin_drivers as string[]} icon={<TrendingUp className="h-3 w-3" />} color="terminal-cyan" />
                    )}
                    {latestAnalysis.industry_tailwinds && (
                      <InsightList title="Industry Tailwinds" items={latestAnalysis.industry_tailwinds as string[]} icon={<Zap className="h-3 w-3" />} color="terminal-blue" />
                    )}
                    {latestAnalysis.hidden_signals && (
                      <InsightList title="Hidden Signals" items={latestAnalysis.hidden_signals as string[]} icon={<Zap className="h-3 w-3" />} color="terminal-amber" />
                    )}
                  </div>

                  {latestAnalysis.important_quotes && (latestAnalysis.important_quotes as string[]).length > 0 && (
                    <div className="mt-5">
                      <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Quote className="h-3 w-3" /> Important Quotes
                      </h4>
                      <div className="space-y-2">
                        {(latestAnalysis.important_quotes as string[]).map((q, i) => (
                          <blockquote key={i} className="text-xs text-muted-foreground italic border-l-2 border-terminal-cyan/40 pl-3 py-1">
                            "{q}"
                          </blockquote>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {analyses && analyses.length > 1 && (
                  <Card className="p-4 bg-card border-border card-glow">
                    <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Analysis History</h3>
                    <div className="space-y-2">
                      {analyses.slice(1).map(a => (
                        <div key={a.id} className="p-3 bg-muted rounded border border-border/50 hover:border-border transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-semibold text-foreground">{a.quarter} {a.year}</span>
                            <div className="flex gap-2">
                              {a.management_tone && <ToneBadge tone={a.management_tone} />}
                              {a.sentiment_score && <SentimentBadge score={a.sentiment_score} />}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{a.analysis_summary}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <EmptyState text="No analysis yet. Go to Transcripts page → upload an earnings call → AI will analyze it." />
            )}
          </TabsContent>

          {/* ═══ COMMITMENTS TAB ═══ */}
          <TabsContent value="commitments" className="space-y-4 mt-4">
            {commitments && commitments.length > 0 ? (
              <>
                <Card className="p-4 bg-card border-border card-glow">
                  <div className="flex items-center gap-6">
                    <div className="text-center min-w-[100px]">
                      <p className={`text-4xl font-mono font-bold ${
                        (credibility ?? 0) >= 70 ? "text-terminal-green" : (credibility ?? 0) >= 40 ? "text-terminal-amber" : "text-terminal-red"
                      }`}>
                        {credibility ?? 0}%
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-1">Credibility Score</p>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>{achievedCount} Achieved</span>
                        <span>{commitments.filter(c => c.status === "Missed").length} Missed</span>
                        <span>{commitments.filter(c => c.status === "Pending").length} Pending</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                        <div className="h-full bg-terminal-green" style={{ width: `${totalCommitments > 0 ? (achievedCount / totalCommitments) * 100 : 0}%` }} />
                        <div className="h-full bg-terminal-red" style={{ width: `${totalCommitments > 0 ? (commitments.filter(c => c.status === "Missed").length / totalCommitments) * 100 : 0}%` }} />
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-card border-border card-glow overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full data-grid">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Quarter</th>
                          <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Commitment</th>
                          <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Metric</th>
                          <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Target</th>
                          <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Timeline</th>
                          <th className="text-center p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commitments.map((c) => (
                          <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="p-2 text-foreground font-mono text-xs">{c.quarter}</td>
                            <td className="p-2 text-foreground text-xs max-w-[300px]">{c.statement}</td>
                            <td className="p-2 text-muted-foreground text-xs">{c.metric || "—"}</td>
                            <td className="p-2 text-muted-foreground text-xs font-mono">{c.target_value || "—"}</td>
                            <td className="p-2 text-muted-foreground text-xs">{c.timeline || "—"}</td>
                            <td className="p-2 text-center">
                              <Badge variant="outline" className={`font-mono text-[10px] ${
                                c.status === "Achieved" ? "text-terminal-green border-terminal-green/30 bg-terminal-green/10" :
                                c.status === "Missed" ? "text-terminal-red border-terminal-red/30 bg-terminal-red/10" :
                                "text-terminal-amber border-terminal-amber/30 bg-terminal-amber/10"
                              }`}>{c.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            ) : (
              <EmptyState text="No commitments tracked yet. Analyze a transcript to extract management commitments." />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ── MULTIBAGGER SIGNAL DETECTION ──
function detectMultibaggerSignals(
  financials: any[],
  latestAnalysis: any,
  commitments: any[]
): { label: string; type: "bullish" | "warning" | "bearish" }[] {
  const signals: { label: string; type: "bullish" | "warning" | "bearish" }[] = [];
  if (financials.length < 2) return signals;

  const latest = financials[financials.length - 1];
  const prev = financials[financials.length - 2];

  // ROCE > 15% consistently
  const highRoceYears = financials.filter(f => (f.roce ?? 0) >= 15).length;
  if (highRoceYears >= 3) signals.push({ label: `ROCE >15% for ${highRoceYears}yr`, type: "bullish" });
  else if (latest.roce && latest.roce < 10) signals.push({ label: `Low ROCE ${latest.roce}%`, type: "bearish" });

  // Revenue growth acceleration
  if (latest.revenue_growth && prev.revenue_growth && latest.revenue_growth > prev.revenue_growth && latest.revenue_growth > 15) {
    signals.push({ label: "Revenue growth accelerating", type: "bullish" });
  }

  // Profit growth > revenue growth (operating leverage)
  if (latest.profit_growth && latest.revenue_growth && latest.profit_growth > latest.revenue_growth) {
    signals.push({ label: "Operating leverage visible", type: "bullish" });
  }

  // OPM expanding
  if (latest.opm && prev.opm && latest.opm > prev.opm) {
    signals.push({ label: `OPM expanding (${prev.opm}→${latest.opm}%)`, type: "bullish" });
  } else if (latest.opm && prev.opm && latest.opm < prev.opm - 3) {
    signals.push({ label: "OPM declining", type: "warning" });
  }

  // Low debt
  if (latest.debt_equity !== null && latest.debt_equity <= 0.5) {
    signals.push({ label: "Low debt (D/E ≤ 0.5)", type: "bullish" });
  } else if (latest.debt_equity !== null && latest.debt_equity > 2) {
    signals.push({ label: `High debt D/E ${latest.debt_equity}`, type: "bearish" });
  }

  // Positive FCF
  const positiveFCFYears = financials.filter(f => (f.free_cash_flow ?? 0) > 0).length;
  if (positiveFCFYears >= 3) signals.push({ label: `Positive FCF ${positiveFCFYears}yr`, type: "bullish" });

  // EPS growth
  if (latest.eps && prev.eps && prev.eps > 0) {
    const epsGrowth = ((latest.eps - prev.eps) / prev.eps) * 100;
    if (epsGrowth > 20) signals.push({ label: `EPS +${Math.round(epsGrowth)}% YoY`, type: "bullish" });
  }

  // High promoter holding
  if (latest.promoter_holding && latest.promoter_holding >= 60) {
    signals.push({ label: `High promoter ${latest.promoter_holding}%`, type: "bullish" });
  }

  // Sentiment from AI analysis
  if (latestAnalysis?.sentiment_score >= 8) {
    signals.push({ label: `AI Sentiment ${latestAnalysis.sentiment_score}/10`, type: "bullish" });
  } else if (latestAnalysis?.sentiment_score && latestAnalysis.sentiment_score <= 4) {
    signals.push({ label: `Low sentiment ${latestAnalysis.sentiment_score}/10`, type: "bearish" });
  }

  // Management credibility
  const achieved = commitments.filter(c => c.status === "Achieved").length;
  const total = commitments.length;
  if (total >= 3 && achieved / total >= 0.7) {
    signals.push({ label: `Mgmt credibility ${Math.round(achieved / total * 100)}%`, type: "bullish" });
  }

  return signals;
}

// ── HELPER COMPONENTS ──

function RatioCard({ label, value, suffix, good }: {
  label: string; value: number | null; suffix?: string; good: boolean;
}) {
  const color = value === null ? "text-muted-foreground" : good ? "text-terminal-green" : "text-terminal-amber";
  return (
    <div className="bg-card border border-border rounded p-3 text-center card-glow">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-mono font-bold ${color}`}>
        {value !== null ? `${value}${suffix || ""}` : "—"}
      </p>
    </div>
  );
}

function ColoredValue({ value, suffix, goodAbove, goodBelow }: {
  value: number | null; suffix?: string; goodAbove?: number; goodBelow?: number;
}) {
  if (value === null) return <span className="font-mono text-muted-foreground">—</span>;
  
  let isGood = false;
  if (goodAbove !== undefined) isGood = value >= goodAbove;
  if (goodBelow !== undefined) isGood = value <= goodBelow;

  return (
    <span className={`font-mono ${isGood ? "text-terminal-green" : value < 0 ? "text-terminal-red" : "text-terminal-amber"}`}>
      {value}{suffix || ""}
    </span>
  );
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="p-3 bg-muted rounded border border-border/50">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
        {icon} {title}
      </p>
      <p className="text-xs text-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function InsightList({ title, items, icon, color }: {
  title: string; items: string[]; icon: React.ReactNode; color: string;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="p-3 bg-muted rounded border border-border/50">
      <h4 className={`font-mono text-[10px] uppercase tracking-wider text-${color} mb-2 flex items-center gap-1.5`}>
        {icon} {title}
      </h4>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-foreground flex items-start gap-2">
            <span className={`mt-1.5 h-1 w-1 rounded-full flex-shrink-0 bg-${color}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-muted-foreground font-mono text-xs text-center px-4">
      {text}
    </div>
  );
}
