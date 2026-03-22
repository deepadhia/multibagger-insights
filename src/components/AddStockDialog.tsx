import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Search, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/apiFetch";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { metricKeysFromProfileConfig } from "@/lib/trackingProfileConfig";

type SearchRow = {
  id: number;
  company_name: string;
  screener_slug: string;
  ticker_hint: string;
};

export function AddStockDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [ticker, setTicker] = useState("");
  const [screenerSlug, setScreenerSlug] = useState("");
  const [sector, setSector] = useState("");
  const [category, setCategory] = useState("Watchlist");
  const [buyPrice, setBuyPrice] = useState("");
  const [thesis, setThesis] = useState("");
  const [trackingProfileJson, setTrackingProfileJson] = useState("");
  const [enriching, setEnriching] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  const { data: searchPayload, isFetching: searchLoading } = useQuery({
    queryKey: ["stock-search", debouncedQ],
    queryFn: async () => {
      const r = await apiFetch(`/api/market/stock-search?q=${encodeURIComponent(debouncedQ)}`);
      if (!r.ok) throw new Error("Search failed");
      return r.json() as Promise<{ ok: boolean; results: SearchRow[] }>;
    },
    enabled: open && debouncedQ.length >= 2,
    staleTime: 60_000,
  });

  const searchResults = searchPayload?.results ?? [];

  const resetForm = useCallback(() => {
    setSearchQ("");
    setDebouncedQ("");
    setCompanyName("");
    setTicker("");
    setScreenerSlug("");
    setSector("");
    setCategory("Watchlist");
    setBuyPrice("");
    setThesis("");
    setTrackingProfileJson("");
    setEnriching(false);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  const handlePickResult = async (row: SearchRow) => {
    setCompanyName(row.company_name);
    setScreenerSlug(row.screener_slug);
    setTicker(row.ticker_hint);
    setSearchQ("");
    setEnriching(true);
    try {
      const r = await apiFetch(`/api/market/stock-enrich?slug=${encodeURIComponent(row.screener_slug)}`);
      const d = (await r.json()) as {
        ok?: boolean;
        ticker?: string;
        company_name?: string | null;
        sector?: string | null;
      };
      if (d.ticker) setTicker(d.ticker);
      if (d.company_name) setCompanyName(d.company_name);
      if (d.sector) setSector(d.sector);
    } catch {
      /* keep search row values */
    } finally {
      setEnriching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    const slug = (screenerSlug.trim() || t).toUpperCase();
    const cn = companyName.trim();
    if (!cn || !t) {
      toast({ title: "Missing fields", description: "Company name and ticker are required.", variant: "destructive" });
      return;
    }

    const profileRaw = trackingProfileJson.trim();
    let profileConfig: Record<string, unknown> | null = null;
    if (profileRaw) {
      try {
        const j = JSON.parse(profileRaw) as unknown;
        if (typeof j !== "object" || j === null || Array.isArray(j)) {
          toast({
            title: "Invalid tracking JSON",
            description: "Master prompt JSON must be a single object (not an array).",
            variant: "destructive",
          });
          return;
        }
        profileConfig = j as Record<string, unknown>;
      } catch {
        toast({
          title: "Invalid JSON",
          description: "Fix the master prompt JSON or clear the field.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    const { data: inserted, error } = await supabase.from("stocks").insert({
      company_name: cn,
      ticker: t,
      sector: sector.trim() || null,
      category,
      buy_price: buyPrice ? Number(buyPrice) : null,
      investment_thesis: thesis.trim() || null,
      screener_slug: slug,
    }).select().single();

    if (error || !inserted) {
      setLoading(false);
      toast({ title: "Error", description: error?.message || "Failed to add stock", variant: "destructive" });
      return;
    }

    const stockId = inserted.id;

    if (profileConfig) {
      const { error: profileErr } = await supabase
        .from("stock_tracking_profiles")
        .upsert({ stock_id: stockId, config: profileConfig as Record<string, unknown> }, { onConflict: "stock_id" });
      if (profileErr) {
        toast({
          title: "Stock added",
          description: `Tracking profile not saved: ${profileErr.message}. You can paste JSON in Master Prompt on the stock page.`,
          variant: "destructive",
        });
      } else {
        const stockUpdates: { tracking_directives?: string; metric_keys?: string[] } = {};
        if (typeof profileConfig.tracking_directives === "string") {
          stockUpdates.tracking_directives = profileConfig.tracking_directives;
        }
        const mk = metricKeysFromProfileConfig(profileConfig);
        if (mk !== null && mk.length > 0) stockUpdates.metric_keys = mk;
        if (Object.keys(stockUpdates).length > 0) {
          await supabase.from("stocks").update(stockUpdates).eq("id", stockId);
        }
        queryClient.invalidateQueries({ queryKey: ["stock-tracking-profile", stockId] });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["stock", stockId] });
    queryClient.invalidateQueries({ queryKey: ["stocks"] });
    setLoading(false);
    setOpen(false);

    toast({
      title: "Stock added",
      description: `Fetching price, financials & filings for ${t} in background…`,
    });

    (async () => {
      try {
        await apiFetch("/api/stocks/refresh-screener-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stock_id: stockId,
            ticker: t,
            screener_slug: slug,
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
            symbols: [t],
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
      <DialogContent className="bg-card border-border max-h-[min(90vh,720px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-primary">Add Stock</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="font-mono text-xs flex items-center gap-1.5">
              <Search className="h-3 w-3" />
              Search (Screener.in — India equities)
            </Label>
            <Input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Type company or ticker, e.g. hdfc, reliance…"
              className="bg-muted border-border font-mono text-sm"
              autoComplete="off"
            />
            <p className="text-[10px] text-muted-foreground font-mono">
              Pick a row to auto-fill NSE ticker (from Screener page), name, and slug. You can still edit fields below.
            </p>
            {open && debouncedQ.length >= 2 && (
              <div className="rounded-md border border-border bg-muted/40 max-h-48 overflow-y-auto">
                {searchLoading ? (
                  <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground font-mono">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground font-mono">No matches. Try another term or fill the form manually.</p>
                ) : (
                  <ul className="py-1">
                    {searchResults.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => void handlePickResult(row)}
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent/80 transition-colors",
                            "border-b border-border/50 last:border-0"
                          )}
                        >
                          <span className="font-semibold text-foreground block">{row.company_name}</span>
                          <span className="text-muted-foreground">
                            Screener: <span className="text-primary">{row.screener_slug}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {enriching && (
            <p className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Resolving NSE ticker from Screener…
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-xs">Company name</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="bg-muted border-border font-mono"
              />
            </div>
            <div>
              <Label className="font-mono text-xs">NSE ticker</Label>
              <Input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                required
                className="bg-muted border-border font-mono uppercase"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-xs">Sector</Label>
              <Input value={sector} onChange={(e) => setSector(e.target.value)} className="bg-muted border-border font-mono" />
            </div>
            <div>
              <Label className="font-mono text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="font-mono text-xs">Buy price</Label>
              <Input
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                type="number"
                step="0.01"
                className="bg-muted border-border font-mono"
              />
            </div>
            <div>
              <Label className="font-mono text-xs">Screener slug</Label>
              <Input
                value={screenerSlug}
                onChange={(e) => setScreenerSlug(e.target.value.toUpperCase())}
                placeholder="Usually same as ticker"
                className="bg-muted border-border font-mono uppercase"
              />
            </div>
          </div>
          <div>
            <Label className="font-mono text-xs">Investment thesis</Label>
            <Textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              className="bg-muted border-border font-mono"
              rows={3}
            />
          </div>

          <Collapsible className="rounded-md border border-border bg-muted/20">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors [&[data-state=open]_svg]:rotate-180"
              >
                <span>Master prompt JSON (optional)</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 px-3 pb-3">
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                Same object as <span className="text-foreground">Copy Gemini prompt</span> / <span className="text-foreground">Master Prompt</span>{" "}
                (<code className="text-primary">core_thesis</code>, <code className="text-primary">tracking_directives</code>,{" "}
                <code className="text-primary">metric_keys</code>, …). Validated before the stock is created.
              </p>
              <Textarea
                value={trackingProfileJson}
                onChange={(e) => setTrackingProfileJson(e.target.value)}
                className="bg-background border-border font-mono text-xs min-h-[140px]"
                placeholder={`{\n  "core_thesis": "…",\n  "tracking_directives": "…",\n  "metric_keys": ["revenue_growth", "opm"]\n}`}
                spellCheck={false}
              />
            </CollapsibleContent>
          </Collapsible>

          <Button type="submit" disabled={loading || enriching} className="w-full font-mono">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding…
              </>
            ) : (
              "Add Stock"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
