import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface FetchStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
}

export function AddStockDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [steps, setSteps] = useState<FetchStep[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateStep = (index: number, update: Partial<FetchStep>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...update } : s));
  };

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

    // Start auto-fetching data
    setFetchingData(true);
    const stockId = inserted.id;

    const fetchSteps: FetchStep[] = [
      { label: "Fetching live price", status: "pending" },
      { label: "Fetching financials & peers", status: "pending" },
    ];
    setSteps(fetchSteps);

    // Step 1: Price
    updateStep(0, { status: "running" });
    try {
      await supabase.functions.invoke("fetch-price", { body: { ticker } });
      updateStep(0, { status: "done" });
    } catch (err: any) {
      updateStep(0, { status: "error", error: err.message });
    }

    // Step 2: Financials
    updateStep(1, { status: "running" });
    try {
      await supabase.functions.invoke("fetch-financials", {
        body: { stock_id: stockId, ticker, screener_slug: screenerSlug },
      });
      updateStep(1, { status: "done" });
    } catch (err: any) {
      updateStep(1, { status: "error", error: err.message });
    }

    // Invalidate all queries
    queryClient.invalidateQueries({ queryKey: ["stocks"] });
    queryClient.invalidateQueries({ queryKey: ["prices", stockId] });
    queryClient.invalidateQueries({ queryKey: ["financial-metrics", stockId] });
    queryClient.invalidateQueries({ queryKey: ["financial-results", stockId] });
    queryClient.invalidateQueries({ queryKey: ["shareholding", stockId] });
    queryClient.invalidateQueries({ queryKey: ["peers", stockId] });

    toast({ title: "Stock added & data fetched", description: `${ticker} is ready.` });
    setFetchingData(false);

    // Auto-close after brief delay
    setTimeout(() => {
      setOpen(false);
      setSteps([]);
    }, 1500);
  };

  const completedSteps = steps.filter(s => s.status === "done" || s.status === "error").length;
  const progressPct = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!fetchingData) setOpen(v); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="font-mono">
          <Plus className="h-4 w-4 mr-1" /> Add Stock
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-primary">Add Stock</DialogTitle>
        </DialogHeader>

        {fetchingData ? (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
              <p className="font-mono text-sm text-foreground">Importing data...</p>
            </div>
            <Progress value={progressPct} className="h-1.5" />
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 font-mono text-xs">
                  {step.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  {step.status === "done" && <Check className="h-3 w-3 text-terminal-green" />}
                  {step.status === "error" && <AlertTriangle className="h-3 w-3 text-terminal-amber" />}
                  {step.status === "pending" && <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />}
                  <span className={step.status === "done" ? "text-terminal-green" : step.status === "error" ? "text-terminal-amber" : "text-muted-foreground"}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
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
              {loading ? "Adding..." : "Add Stock"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
