import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/apiFetch";

export function AddStockDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const ticker = (form.get("ticker") as string).toUpperCase();
    const screenerSlug = (form.get("screener_slug") as string) || ticker;

    const { data: inserted, error } = await supabase.from("stocks").insert({
      company_name: form.get("company_name") as string,
      ticker,
      sector: form.get("sector") as string || null,
      category: form.get("category") as string,
      buy_price: form.get("buy_price") ? Number(form.get("buy_price")) : null,
      investment_thesis: form.get("investment_thesis") as string || null,
      screener_slug: screenerSlug,
    }).select().single();

    if (error || !inserted) {
      setLoading(false);
      toast({ title: "Error", description: error?.message || "Failed to add stock", variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["stocks"] });
    setLoading(false);
    setOpen(false);

    const stockId = inserted.id;
    toast({
      title: "Stock added",
      description: `Fetching price, financials & filings for ${ticker} in background…`,
    });

    // Run fetches in background (don't block UI)
    (async () => {
      try {
        await apiFetch("/api/stocks/refresh-screener-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stock_id: stockId,
            ticker,
            screener_slug: screenerSlug,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["prices"] });
        queryClient.invalidateQueries({ queryKey: ["financial-metrics", stockId] });
        queryClient.invalidateQueries({ queryKey: ["financial-results", stockId] });
        queryClient.invalidateQueries({ queryKey: ["shareholding", stockId] });
        queryClient.invalidateQueries({ queryKey: ["peers", stockId] });
      } catch (_) {}
      try {
        await apiFetch("/api/transcripts/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbols: [ticker],
            onlyMissing: true,
            uploadAfterDownload: true,
            window: "1y",
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["transcripts-files"] });
      } catch (_) {}
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="font-mono">
          <Plus className="h-4 w-4 mr-1" /> Add Stock
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-primary">Add Stock</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs">Company Name</Label>
                <Input name="company_name" required className="bg-muted border-border font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Ticker</Label>
                <Input name="ticker" required className="bg-muted border-border font-mono uppercase" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs">Sector</Label>
                <Input name="sector" className="bg-muted border-border font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Category</Label>
                <Select name="category" defaultValue="Watchlist">
                  <SelectTrigger className="bg-muted border-border font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Core">Core</SelectItem>
                    <SelectItem value="Starter">Starter</SelectItem>
                    <SelectItem value="Watchlist">Watchlist</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs">Buy Price</Label>
                <Input name="buy_price" type="number" step="0.01" className="bg-muted border-border font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Screener Slug</Label>
                <Input name="screener_slug" placeholder="e.g. HBLENGINE" className="bg-muted border-border font-mono" />
              </div>
            </div>
            <div>
              <Label className="font-mono text-xs">Investment Thesis</Label>
              <Textarea name="investment_thesis" className="bg-muted border-border font-mono" rows={3} />
            </div>
            <Button type="submit" disabled={loading} className="w-full font-mono">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding...</> : "Add Stock"}
            </Button>
          </form>
      </DialogContent>
    </Dialog>
  );
}
