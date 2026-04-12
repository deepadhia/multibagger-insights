import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useStocks, useAllAnalysis } from "@/hooks/useStocks";
import {
  useAllFinancialMetrics,
  useAllShareholding,
  useAllSnapshots,
  useAllPromises,
  useAllCommitments,
} from "@/hooks/usePortfolioData";
import { detectMultibaggerSignals, calculateThesisScore, getThesisStatus } from "@/lib/signals";
import { sortSnapshotsByQuarterDesc } from "@/lib/quarterSort";
import { buildPortfolioAiExport, type StockRow } from "@/lib/buildPortfolioAiExport";
import { buildStandaloneRankingClipboardPayload } from "@/lib/buildPortfolioRankingExport";
import type { SnapshotRowLike } from "@/lib/snapshotPortfolioRank";
import { Sparkles, ChevronDown, Loader2, FileJson, ListOrdered } from "lucide-react";

export function PortfolioAiBriefButton() {
  const { data: stocks, isLoading: loadingStocks } = useStocks();
  const { data: analyses, isLoading: loadingAnalyses } = useAllAnalysis();
  const { data: allFinancials, isLoading: loadingFin } = useAllFinancialMetrics();
  const { data: allShareholding, isLoading: loadingSh } = useAllShareholding();
  const { data: allSnapshots, isLoading: loadingSn } = useAllSnapshots();
  const { data: allPromises, isLoading: loadingPr } = useAllPromises();
  const { data: allCommitments, isLoading: loadingCo } = useAllCommitments();
  const { toast } = useToast();
  const [copying, setCopying] = useState<"summary" | "full" | "ranking" | null>(null);

  const loading =
    loadingStocks ||
    loadingAnalyses ||
    loadingFin ||
    loadingSh ||
    loadingSn ||
    loadingPr ||
    loadingCo;

  const latestAnalysisByStockId = useMemo(() => {
    const map: Record<string, { sentiment_score: number | null; management_tone: string | null }> = {};
    (analyses || []).forEach((a) => {
      const id = (a as { stock_id: string }).stock_id;
      if (!map[id]) {
        map[id] = {
          sentiment_score: (a as { sentiment_score: number | null }).sentiment_score ?? null,
          management_tone: (a as { management_tone: string | null }).management_tone ?? null,
        };
      }
    });
    return map;
  }, [analyses]);

  const stockSignals = useMemo(() => {
    if (!stocks?.length) return [];
    return stocks.map((stock) => {
      const financials = (allFinancials || []).filter((f) => f.stock_id === stock.id);
      const shareholding = (allShareholding || []).filter((s) => s.stock_id === stock.id);
      const snapshots = sortSnapshotsByQuarterDesc(
        (allSnapshots || []).filter((s) => s.stock_id === stock.id)
      );
      const promises = (allPromises || []).filter((p) => p.stock_id === stock.id);
      const commitments = (allCommitments || []).filter((c) => c.stock_id === stock.id);
      const stockAnalyses = (analyses || []).filter((a) => (a as { stock_id: string }).stock_id === stock.id);
      const latestAnalysis = stockAnalyses[0];

      const signals = detectMultibaggerSignals(
        financials,
        latestAnalysis,
        commitments,
        shareholding,
        promises,
        snapshots,
        stockAnalyses
      );
      const score = calculateThesisScore(signals);
      const thesisStatus = getThesisStatus(signals, score);

      return { stock: stock as StockRow, signals, score, thesisStatus };
    });
  }, [stocks, allFinancials, allShareholding, allSnapshots, allPromises, allCommitments, analyses]);

  const stocksWithQuarterlyJsonCount = useMemo(() => {
    const ids = new Set<string>();
    (allSnapshots || []).forEach((s) => {
      if (s.stock_id) ids.add(s.stock_id as string);
    });
    if (!stocks?.length) return 0;
    return stocks.filter((st) => ids.has(st.id)).length;
  }, [stocks, allSnapshots]);

  const copyPayload = async (includeRawSnapshots: boolean) => {
    if (!stocks?.length) {
      toast({ title: "No stocks", description: "Add stocks before exporting.", variant: "destructive" });
      return;
    }
    if (stocksWithQuarterlyJsonCount === 0) {
      toast({
        title: "Nothing to export",
        description: "Import at least one quarterly AI snapshot on a stock first. Stocks without quarterly JSON are skipped.",
        variant: "destructive",
      });
      return;
    }
    setCopying(includeRawSnapshots ? "full" : "summary");
    try {
      const payload = buildPortfolioAiExport({
        stocks: stocks as StockRow[],
        stockSignals,
        allSnapshots: (allSnapshots || []) as Parameters<typeof buildPortfolioAiExport>[0]["allSnapshots"],
        latestAnalysisByStockId,
        includeRawSnapshots,
      });
      const text = JSON.stringify(payload, null, 2);
      await navigator.clipboard.writeText(text);
      const n = payload.portfolio_summary.stock_count;
      toast({
        title: "Copied to clipboard",
        description: includeRawSnapshots
          ? `${n} stock${n === 1 ? "" : "s"} — summary + full raw JSON per quarter.`
          : `${n} stock${n === 1 ? "" : "s"} with quarterly imports only — paste into your AI.`,
      });
    } catch (e) {
      toast({
        title: "Copy failed",
        description: e instanceof Error ? e.message : "Clipboard unavailable",
        variant: "destructive",
      });
    } finally {
      setCopying(null);
    }
  };

  const copyRankingOnly = async () => {
    if (!stocks?.length) {
      toast({ title: "No stocks", description: "Add stocks before exporting.", variant: "destructive" });
      return;
    }
    if (stocksWithQuarterlyJsonCount === 0) {
      toast({
        title: "Nothing to export",
        description: "Import at least one quarterly AI snapshot on a stock first.",
        variant: "destructive",
      });
      return;
    }
    setCopying("ranking");
    try {
      const payload = buildStandaloneRankingClipboardPayload(
        stocks as StockRow[],
        (allSnapshots || []) as SnapshotRowLike[],
      );
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      const n = payload.leaderboard.length;
      toast({
        title: "Ranking copied",
        description: `${n} name${n === 1 ? "" : "s"} — live order, rationale, and top consolidated pick.`,
      });
    } catch (e) {
      toast({
        title: "Copy failed",
        description: e instanceof Error ? e.message : "Clipboard unavailable",
        variant: "destructive",
      });
    } finally {
      setCopying(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="font-mono text-xs gap-1.5"
          disabled={loading || !!copying || !stocks?.length || stocksWithQuarterlyJsonCount === 0}
          title={
            stocksWithQuarterlyJsonCount === 0 && stocks?.length
              ? "Import quarterly AI JSON on at least one stock to enable export"
              : undefined
          }
        >
          {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          AI portfolio brief
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-mono w-[min(100vw-2rem,22rem)]">
        <DropdownMenuItem
          className="text-xs flex-col items-start gap-1 py-2 cursor-pointer"
          onClick={() => void copyPayload(false)}
        >
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Summary (recommended)
          </span>
          <span className="text-muted-foreground font-normal leading-snug">
            Only stocks with imported quarterly snapshots. Thesis scores, signals, summaries — no raw Gemini JSON.
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs flex-col items-start gap-1 py-2 cursor-pointer"
          onClick={() => void copyRankingOnly()}
        >
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <ListOrdered className="h-3 w-3" /> Ranking leaderboard only
          </span>
          <span className="text-muted-foreground font-normal leading-snug">
            Live order, per-stock “why” (thesis, trajectory, verdict), saved list batch fields, and highest consolidated pick — compact JSON.
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-xs flex-col items-start gap-1 py-2 cursor-pointer"
          onClick={() => void copyPayload(true)}
        >
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <FileJson className="h-3 w-3" /> + Full raw AI JSON
          </span>
          <span className="text-muted-foreground font-normal leading-snug">
            Same filter (quarterly JSON only), plus each quarter’s full <code className="text-[10px]">raw_ai_output</code>. Can be very large.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
