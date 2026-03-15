import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useStocks } from "@/hooks/useStocks";
import { AddStockDialog } from "@/components/AddStockDialog";
import { SentimentBadge } from "@/components/SentimentBadge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, RefreshCw, Loader2, ChevronDown, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function StocksPage() {
  const { data: stocks, isLoading } = useStocks();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const refreshActions = [
    { key: "prices", label: "Refresh Prices" },
    { key: "financials", label: "Refresh Financials" },
    { key: "backfill", label: "Backfill 3Y Prices" },
    { key: "results", label: "Fetch Results Dates" },
  ];

  const handleRefresh = async (key: string) => {
    if (!stocks?.length && key !== "results") return;
    setRefreshing(key);

    try {
      if (key === "prices") {
        let success = 0, failed = 0;
        for (const stock of stocks!) {
          try {
            const r = await fetch("/api/prices/fetch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ticker: stock.ticker }),
            });
            r.ok ? success++ : failed++;
          } catch { failed++; }
        }
        queryClient.invalidateQueries({ queryKey: ["prices"] });
        toast({ title: "Prices refreshed", description: `${success} updated, ${failed} failed` });

      } else if (key === "financials") {
        let success = 0, failed = 0;
        for (const stock of stocks!) {
          if (success + failed > 0) await new Promise(r => setTimeout(r, 2000));
          try {
            const r = await fetch("/api/financials/fetch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                stock_id: stock.id,
                ticker: stock.ticker,
                screener_slug: stock.screener_slug || stock.ticker,
              }),
            });
            r.ok ? success++ : failed++;
          } catch { failed++; }
        }
        queryClient.invalidateQueries({ queryKey: ["financial-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["financial-results"] });
        toast({ title: "Financials refreshed", description: `${success} updated, ${failed} failed` });

      } else if (key === "backfill") {
        const r = await fetch("/api/prices/refresh-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backfill: true }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error ?? `Request failed: ${r.status}`);
        queryClient.invalidateQueries({ queryKey: ["prices"] });
        queryClient.invalidateQueries({ queryKey: ["all-prices"] });
        toast({ title: "3Y Price Backfill Complete", description: data?.message || "Historical prices loaded" });

      } else if (key === "results") {
        const { data, error } = await supabase.functions.invoke("fetch-results-calendar");
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["stocks"] });
        toast({ title: "Results dates updated", description: data?.message || `${data?.updated || 0} stocks updated` });
      }
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }

    setRefreshing(null);
  };

  // Fetch latest analysis per stock
  const { data: latestAnalysis } = useQuery({
    queryKey: ["latest-analysis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transcript_analysis")
        .select("stock_id, sentiment_score, management_tone")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, { sentiment_score: number | null; management_tone: string | null }> = {};
      data.forEach((a) => { if (!map[a.stock_id]) map[a.stock_id] = a; });
      return map;
    },
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const { error } = await supabase.from("stocks").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      toast({ title: "Stock deleted" });
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "Core": return "bg-terminal-green/20 text-terminal-green border-terminal-green/30";
      case "Starter": return "bg-terminal-cyan/20 text-terminal-cyan border-terminal-cyan/30";
      default: return "bg-terminal-amber/20 text-terminal-amber border-terminal-amber/30";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono font-bold text-primary terminal-glow">Stocks</h1>
            <p className="text-sm text-muted-foreground font-mono mt-1">Track and manage your portfolio</p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono"
                  disabled={!!refreshing}
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {refreshing
                    ? refreshActions.find(a => a.key === refreshing)?.label || "Refreshing..."
                    : "Refresh Data"}
                  <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="font-mono">
                {refreshActions.map((action) => (
                  <DropdownMenuItem
                    key={action.key}
                    onClick={() => handleRefresh(action.key)}
                    disabled={!!refreshing}
                    className="text-xs"
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <AddStockDialog />
          </div>
        </div>

        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full data-grid">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-muted-foreground text-xs uppercase tracking-wider">Company</th>
                  <th className="text-left p-3 text-muted-foreground text-xs uppercase tracking-wider">Ticker</th>
                  <th className="text-left p-3 text-muted-foreground text-xs uppercase tracking-wider">Sector</th>
                  <th className="text-left p-3 text-muted-foreground text-xs uppercase tracking-wider">Category</th>
                  <th className="text-center p-3 text-muted-foreground text-xs uppercase tracking-wider">Next Results</th>
                  <th className="text-right p-3 text-muted-foreground text-xs uppercase tracking-wider">Buy Price</th>
                  <th className="text-center p-3 text-muted-foreground text-xs uppercase tracking-wider">Sentiment</th>
                  <th className="text-center p-3 text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : !stocks?.length ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No stocks added yet.</td></tr>
                ) : (
                  stocks.map((stock) => {
                    const analysis = latestAnalysis?.[stock.id];
                    return (
                      <tr
                        key={stock.id}
                        onClick={() => navigate(`/stocks/${stock.id}`)}
                        className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="p-3 font-semibold text-foreground">{stock.company_name}</td>
                        <td className="p-3 text-primary">{stock.ticker}</td>
                        <td className="p-3 text-muted-foreground">{stock.sector || "—"}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={getCategoryColor(stock.category)}>
                            {stock.category}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          {(stock as any).next_results_date ? (
                            <Badge
                              variant="outline"
                              className={`font-mono text-[10px] ${
                                new Date((stock as any).next_results_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                  ? "text-terminal-amber border-terminal-amber/30 bg-terminal-amber/10"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {new Date((stock as any).next_results_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right">{stock.buy_price ? `₹${stock.buy_price}` : "—"}</td>
                        <td className="p-3 text-center">
                          {analysis?.sentiment_score ? <SentimentBadge score={analysis.sentiment_score} /> : "—"}
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={(e) => handleDelete(e, stock.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
