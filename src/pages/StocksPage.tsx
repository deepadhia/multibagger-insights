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
import { Trash2, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function StocksPage() {
  const { data: stocks, isLoading } = useStocks();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [refreshingFinancials, setRefreshingFinancials] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const handleRefreshAllPrices = async () => {
    if (!stocks?.length) return;
    setRefreshingPrices(true);
    let success = 0;
    let failed = 0;

    for (const stock of stocks) {
      try {
        const { data, error } = await supabase.functions.invoke("fetch-price", {
          body: { ticker: stock.ticker },
        });
        if (error || data?.success === false) {
          failed++;
        } else {
          success++;
        }
      } catch {
        failed++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["prices"] });
    toast({
      title: "Prices refreshed",
      description: `${success} updated, ${failed} failed out of ${stocks.length} stocks`,
    });
    setRefreshingPrices(false);
  };

  const handleRefreshAllFinancials = async () => {
    if (!stocks?.length) return;
    setRefreshingFinancials(true);
    let success = 0;
    let failed = 0;

    for (const stock of stocks) {
      try {
        // Add delay between requests to avoid rate limiting
        if (success + failed > 0) await new Promise(r => setTimeout(r, 2000));
        const { data, error } = await supabase.functions.invoke("fetch-financials", {
          body: {
            stock_id: stock.id,
            ticker: stock.ticker,
            screener_slug: stock.screener_slug || stock.ticker,
          },
        });
        if (error || data?.success === false) {
          failed++;
        } else {
          success++;
        }
      } catch {
        failed++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["financial-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["financial-results"] });
    toast({
      title: "Financials refreshed",
      description: `${success} updated, ${failed} failed out of ${stocks.length} stocks`,
    });
    setRefreshingFinancials(false);
  };

  const handleBackfillPrices = async () => {
    if (!stocks?.length) return;
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-all-prices", {
        body: { backfill: true },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["prices"] });
      queryClient.invalidateQueries({ queryKey: ["all-prices"] });
      toast({
        title: "3Y Price Backfill Complete",
        description: data?.message || "Historical prices loaded",
      });
    } catch (e: any) {
      toast({ title: "Backfill failed", description: e.message, variant: "destructive" });
    }
    setBackfilling(false);
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
      // Group by stock_id, take first (latest)
      const map: Record<string, { sentiment_score: number | null; management_tone: string | null }> = {};
      data.forEach((a) => {
        if (!map[a.stock_id]) map[a.stock_id] = a;
      });
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAllPrices}
              disabled={refreshingPrices || !stocks?.length}
              className="font-mono"
            >
              {refreshingPrices ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {refreshingPrices ? "Refreshing..." : "Refresh Prices"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAllFinancials}
              disabled={refreshingFinancials || !stocks?.length}
              className="font-mono"
            >
              {refreshingFinancials ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {refreshingFinancials ? "Refreshing..." : "Refresh Financials"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackfillPrices}
              disabled={backfilling || !stocks?.length}
              className="font-mono"
            >
              {backfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {backfilling ? "Backfilling..." : "Backfill 3Y Prices"}
            </Button>
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
                  <th className="text-right p-3 text-muted-foreground text-xs uppercase tracking-wider">Buy Price</th>
                  <th className="text-center p-3 text-muted-foreground text-xs uppercase tracking-wider">Sentiment</th>
                  <th className="text-center p-3 text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : !stocks?.length ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No stocks added yet.</td></tr>
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
