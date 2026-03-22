import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/apiFetch";

const WINDOW_OPTIONS = [
  { value: "3q", label: "3q" },
  { value: "6m", label: "6m" },
  { value: "1y", label: "1y" },
] as const;

export function MasterFetchButton() {
  const [fetching, setFetching] = useState(false);
  const [window, setWindow] = useState<"3q" | "6m" | "1y">("1y");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleMasterFetch = async () => {
    if (fetching) return;
    setFetching(true);

    const results = { prices: "", financials: "", results: "", filings: "" };

    try {
      // 1. Prices (all stocks) – Express
      toast({ title: "Fetch all", description: "Refreshing prices…" });
      const priceRes = await apiFetch("/api/prices/refresh-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const priceData = await priceRes.json().catch(() => ({}));
      if (!priceRes.ok) {
        results.prices = `Prices: ${priceData?.error ?? priceRes.status}`;
      } else {
        results.prices = priceData?.message ?? "Prices updated";
      }
      queryClient.invalidateQueries({ queryKey: ["prices"] });
      queryClient.invalidateQueries({ queryKey: ["all-prices"] });

      // 2. Financials (all stocks) – Express
      toast({ title: "Fetch all", description: "Refreshing financials…" });
      const finRes = await apiFetch("/api/financials/refresh-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const finData = await finRes.json().catch(() => ({}));
      if (!finRes.ok) {
        results.financials = `Financials: ${finData?.error ?? finRes.status}`;
      } else {
        results.financials = finData?.message ?? "Financials updated";
      }
      queryClient.invalidateQueries({ queryKey: ["financial-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["financial-results"] });
      queryClient.invalidateQueries({ queryKey: ["shareholding"] });
      queryClient.invalidateQueries({ queryKey: ["peers"] });

      // 3. Results calendar (upcoming results dates)
      toast({ title: "Fetch all", description: "Fetching results calendar…" });
      const calRes = await supabase.functions.invoke("fetch-results-calendar", { body: {} });
      if (calRes.error) {
        results.results = `Calendar: ${calRes.error.message}`;
      } else {
        const d = calRes.data as { message?: string; updated?: number };
        results.results = d?.message ?? (d?.updated != null ? `${d.updated} dates updated` : "Done");
      }
      queryClient.invalidateQueries({ queryKey: ["stocks"] });

      // 4. Transcripts (download + upload to Drive for watchlist)
      toast({ title: "Fetch all", description: "Downloading filings & uploading to Drive…" });
      const transcriptRes = await apiFetch("/api/transcripts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useWatchlist: true,
          onlyMissing: true,
          uploadAfterDownload: true,
          window,
        }),
      });
      const transcriptData = await transcriptRes.json().catch(() => ({}));
      if (!transcriptRes.ok || !transcriptData?.ok) {
        results.filings = transcriptData?.error ?? `Status ${transcriptRes.status}`;
      } else {
        const up = transcriptData?.uploadAfterDownload ?? {};
        const uploaded = up.uploaded ?? 0;
        const errs = up.errors ?? [];
        results.filings =
          uploaded > 0 || errs.length > 0
            ? `Uploaded ${uploaded}${errs.length > 0 ? `, ${errs.length} failed` : ""}`
            : transcriptData?.skipped
              ? "Filings up to date"
              : "Done";
      }
      queryClient.invalidateQueries({ queryKey: ["transcripts-files"] });
      queryClient.invalidateQueries({ queryKey: ["transcripts-drive-status"] });

      const summary = [results.prices, results.financials, results.results, results.filings]
        .filter(Boolean)
        .join(". ");
      toast({
        title: "Fetch all complete",
        description: summary || "Prices, financials, results dates and filings updated.",
      });
    } catch (err) {
      toast({
        title: "Fetch all failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={window} onValueChange={(v) => setWindow(v as "3q" | "6m" | "1y")}>
        <SelectTrigger className="w-[70px] h-8 font-mono text-xs border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WINDOW_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="font-mono text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleMasterFetch}
        disabled={fetching}
        className="font-mono text-xs"
      >
        {fetching ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        <span className="ml-1">Fetch all</span>
      </Button>
    </div>
  );
}
