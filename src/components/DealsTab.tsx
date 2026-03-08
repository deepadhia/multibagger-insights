import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInsiderTrades, useBulkDeals } from "@/hooks/useDeals";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Loader2, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Briefcase, UserCheck } from "lucide-react";

interface Props {
  stockId: string;
  ticker: string;
}

export function DealsTab({ stockId, ticker }: Props) {
  const { data: insiderTrades, isLoading: loadingInsider } = useInsiderTrades(stockId);
  const { data: bulkDeals, isLoading: loadingBulk } = useBulkDeals(stockId);
  const [fetching, setFetching] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleFetch = async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-deals", {
        body: { ticker, stock_id: stockId },
      });
      if (error) throw error;
      if (data?.success === false) {
        toast({ title: "Deals unavailable", description: data.error, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["insider-trades", stockId] });
      queryClient.invalidateQueries({ queryKey: ["bulk-deals", stockId] });
      toast({ title: "Deals updated", description: data.message });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFetching(false);
    }
  };

  const hasInsider = insiderTrades && insiderTrades.length > 0;
  const hasBulk = bulkDeals && bulkDeals.length > 0;
  const isEmpty = !hasInsider && !hasBulk && !loadingInsider && !loadingBulk;

  // Summarize insider activity
  const insiderBuys = insiderTrades?.filter(t => 
    (t.mode_of_acquisition || '').toLowerCase().includes('buy') || 
    (t.mode_of_acquisition || '').toLowerCase().includes('acquisition') ||
    (t.num_securities || 0) > 0
  ).length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Insider & Bulk/Block Deals (Last 6 months)
        </h3>
        <Button variant="outline" size="sm" onClick={handleFetch} disabled={fetching} className="font-mono text-xs">
          {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span className="ml-1">Fetch from NSE</span>
        </Button>
      </div>

      {isEmpty && (
        <Card className="p-8 bg-card border-border">
          <div className="text-center text-muted-foreground font-mono text-xs">
            No deal data yet. Click "Fetch from NSE" to pull insider trades and bulk/block deals.
          </div>
        </Card>
      )}

      {/* Insider Trades */}
      {hasInsider && (
        <Card className="p-4 bg-card border-border card-glow overflow-hidden">
          <h4 className="font-mono text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            Insider Trades ({insiderTrades.length})
            {insiderBuys > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] text-terminal-green border-terminal-green/30 bg-terminal-green/10">
                {insiderBuys} buys
              </Badge>
            )}
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full data-grid">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Date</th>
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Person</th>
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Category</th>
                  <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Securities</th>
                  <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Value (₹)</th>
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Mode</th>
                </tr>
              </thead>
              <tbody>
                {insiderTrades.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-2 text-foreground font-mono text-xs">{t.trade_date}</td>
                    <td className="p-2 text-foreground text-xs max-w-[200px] truncate">{t.person_name}</td>
                    <td className="p-2 text-muted-foreground text-xs">{t.person_category || "—"}</td>
                    <td className="p-2 text-right font-mono text-xs text-foreground">
                      {t.num_securities ? Number(t.num_securities).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-right font-mono text-xs text-foreground">
                      {t.trade_value ? `₹${Number(t.trade_value).toLocaleString()}` : "—"}
                    </td>
                    <td className="p-2 text-xs">
                      {t.mode_of_acquisition ? (
                        <Badge variant="outline" className={`font-mono text-[10px] ${
                          (t.mode_of_acquisition || '').toLowerCase().includes('buy') || (t.mode_of_acquisition || '').toLowerCase().includes('acquisition')
                            ? "text-terminal-green border-terminal-green/30"
                            : (t.mode_of_acquisition || '').toLowerCase().includes('sell') || (t.mode_of_acquisition || '').toLowerCase().includes('disposal')
                            ? "text-terminal-red border-terminal-red/30"
                            : "text-muted-foreground"
                        }`}>
                          {t.mode_of_acquisition}
                        </Badge>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Bulk & Block Deals */}
      {hasBulk && (
        <Card className="p-4 bg-card border-border card-glow overflow-hidden">
          <h4 className="font-mono text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Bulk & Block Deals ({bulkDeals.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full data-grid">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Date</th>
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Type</th>
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Client</th>
                  <th className="text-center p-2 text-muted-foreground text-[10px] uppercase tracking-wider">B/S</th>
                  <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Qty</th>
                  <th className="text-right p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Avg Price</th>
                  <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {bulkDeals.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-2 text-foreground font-mono text-xs">{d.deal_date}</td>
                    <td className="p-2">
                      <Badge variant="secondary" className="font-mono text-[10px]">{d.deal_type}</Badge>
                    </td>
                    <td className="p-2 text-foreground text-xs max-w-[200px] truncate">{d.client_name}</td>
                    <td className="p-2 text-center">
                      {d.buy_sell ? (
                        <span className={`font-mono text-xs font-semibold ${
                          d.buy_sell.toLowerCase().includes('buy') ? "text-terminal-green" : "text-terminal-red"
                        }`}>
                          {d.buy_sell.toLowerCase().includes('buy') ? (
                            <><ArrowUpRight className="h-3 w-3 inline" /> Buy</>
                          ) : (
                            <><ArrowDownRight className="h-3 w-3 inline" /> Sell</>
                          )}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-2 text-right font-mono text-xs text-foreground">
                      {d.quantity ? Number(d.quantity).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-right font-mono text-xs text-foreground">
                      {d.avg_price ? `₹${Number(d.avg_price).toLocaleString()}` : "—"}
                    </td>
                    <td className="p-2 text-muted-foreground text-xs max-w-[150px] truncate">{d.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
