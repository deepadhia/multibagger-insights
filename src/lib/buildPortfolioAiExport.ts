import type { Signal, ThesisStatus } from "@/lib/signals";
import { sortSnapshotsByQuarterDesc } from "@/lib/quarterSort";
import type { SnapshotRowLike } from "@/lib/snapshotPortfolioRank";
import { buildPortfolioRankingBlock, type StockWithPortfolioFields } from "@/lib/buildPortfolioRankingExport";

export type StockRow = {
  id: string;
  ticker: string;
  company_name: string;
  sector: string | null;
  category: string;
  buy_price: number | null;
  next_results_date?: string | null;
  investment_thesis?: string | null;
  portfolio_list_rank?: number | null;
  portfolio_list_cohort_size?: number | null;
  portfolio_consolidated_score?: number | null;
  portfolio_trajectory_bonus?: number | null;
  portfolio_latest_quarter_sort_score?: number | null;
  portfolio_scores_updated_at?: string | null;
};

type AnalysisLite = { sentiment_score: number | null; management_tone: string | null } | null | undefined;

type SnapshotRow = Record<string, unknown> & {
  id: string;
  stock_id: string;
  quarter: string;
  summary: string | null;
  thesis_status: string | null;
  red_flags?: unknown;
  dodged_questions?: unknown;
  metrics?: unknown;
  raw_ai_output?: unknown;
  confidence_score?: number | null;
  thesis_momentum?: string | null;
};

function snapshotToBrief(snap: SnapshotRow, includeRaw: boolean) {
  const raw = snap.raw_ai_output as Record<string, unknown> | null | undefined;
  const snapshotBlock = raw?.snapshot as Record<string, unknown> | undefined;
  const actionVerdict = raw?.actionable_verdict as { decision?: string; conviction_level?: string } | undefined;

  const row: Record<string, unknown> = {
    quarter: snap.quarter,
    summary: snap.summary,
    thesis_status: snap.thesis_status,
    confidence_score: snap.confidence_score ?? snapshotBlock?.confidence_score ?? null,
    thesis_momentum: snap.thesis_momentum ?? snapshotBlock?.thesis_momentum ?? null,
    action_decision: actionVerdict?.decision ?? null,
    conviction: actionVerdict?.conviction_level ?? null,
    red_flags: snap.red_flags ?? null,
    dodged_questions: snap.dodged_questions ?? null,
    metrics: snap.metrics ?? null,
  };

  if (includeRaw && raw) {
    row.raw_ai_output = raw;
  }

  return row;
}

export type PortfolioStockSignals = {
  stock: StockRow;
  signals: Signal[];
  score: number;
  thesisStatus: ThesisStatus;
};

export function buildPortfolioAiExport(options: {
  stocks: StockRow[];
  stockSignals: PortfolioStockSignals[];
  allSnapshots: SnapshotRow[];
  latestAnalysisByStockId: Record<string, AnalysisLite>;
  includeRawSnapshots: boolean;
}) {
  const { stocks, stockSignals, allSnapshots, latestAnalysisByStockId, includeRawSnapshots } = options;
  const now = new Date().toISOString();

  /** Only stocks with at least one imported quarterly snapshot (JSON) in DB. */
  const stockIdsWithQuarterlyJson = new Set<string>();
  for (const row of allSnapshots || []) {
    if (row.stock_id) stockIdsWithQuarterlyJson.add(row.stock_id);
  }

  const filteredStocks = stocks.filter((s) => stockIdsWithQuarterlyJson.has(s.id));
  const filteredSignals = stockSignals.filter((ss) => stockIdsWithQuarterlyJson.has(ss.stock.id));

  const portfolio_ranking = buildPortfolioRankingBlock(
    filteredStocks as StockWithPortfolioFields[],
    allSnapshots as SnapshotRowLike[],
  );

  const byStatus = {
    Strengthening: [] as string[],
    Stable: [] as string[],
    Weakening: [] as string[],
    Broken: [] as string[],
  };

  const capitalizeMore: PortfolioStockSignals[] = [];
  const stayCautious: PortfolioStockSignals[] = [];
  const balanced: PortfolioStockSignals[] = [];

  for (const ss of filteredSignals) {
    byStatus[ss.thesisStatus.status].push(ss.stock.ticker);
    if (ss.thesisStatus.status === "Strengthening" && ss.score >= 60) {
      capitalizeMore.push(ss);
    } else if (ss.thesisStatus.status === "Weakening" || ss.thesisStatus.status === "Broken" || ss.score < 40) {
      stayCautious.push(ss);
    } else {
      balanced.push(ss);
    }
  }

  capitalizeMore.sort((a, b) => b.score - a.score);
  stayCautious.sort((a, b) => a.score - b.score);
  balanced.sort((a, b) => b.score - a.score);

  const stocksPayload = stocks.map((stock) => {
    const ss = stockSignals.find((s) => s.stock.id === stock.id);
    const snaps = sortSnapshotsByQuarterDesc(
      (allSnapshots || []).filter((s) => s.stock_id === stock.id)
    ) as SnapshotRow[];

    const signals = ss?.signals ?? [];
    const grouped = {
      bullish: signals.filter((s) => s.type === "bullish").map((s) => s.label),
      warning: signals.filter((s) => s.type === "warning").map((s) => s.label),
      bearish: signals.filter((s) => s.type === "bearish").map((s) => s.label),
    };

    const analysis = latestAnalysisByStockId[stock.id];

    return {
      ticker: stock.ticker,
      company_name: stock.company_name,
      sector: stock.sector,
      category: stock.category,
      buy_price: stock.buy_price,
      next_results_date: stock.next_results_date ?? null,
      investment_thesis: stock.investment_thesis ?? null,
      thesis_score: ss?.score ?? null,
      thesis_status: ss?.thesisStatus.status ?? null,
      thesis_status_reason: ss?.thesisStatus.reason ?? null,
      latest_transcript_analysis: analysis
        ? { sentiment_score: analysis.sentiment_score, management_tone: analysis.management_tone }
        : null,
      computed_signals: grouped,
      quarterly_snapshots: snaps.map((s) => snapshotToBrief(s, includeRawSnapshots)),
    };
  });

  const avgScore =
    filteredSignals.length > 0
      ? Math.round(filteredSignals.reduce((a, s) => a + s.score, 0) / filteredSignals.length)
      : 0;

  const brief = (ss: PortfolioStockSignals) => ({
    ticker: ss.stock.ticker,
    company_name: ss.stock.company_name,
    category: ss.stock.category,
    thesis_score: ss.score,
    thesis_status: ss.thesisStatus.status,
    reason: ss.thesisStatus.reason,
    top_bullish: ss.signals.filter((x) => x.type === "bullish").slice(0, 5).map((x) => x.label),
    top_risks: [
      ...ss.signals.filter((x) => x.type === "bearish").map((x) => x.label),
      ...ss.signals.filter((x) => x.type === "warning").map((x) => x.label),
    ].slice(0, 6),
  });

  return {
    generated_at: now,
    source: "multibagger-insights",
    purpose:
      "Portfolio review for allocation and risk: where conviction is high vs where to be cautious. Use as context only—not investment advice.",
    suggested_prompt_for_ai: [
      "I track Indian equities in this app. Using ONLY the JSON below:",
      "1) Group names where I could consider adding exposure (thesis strengthening, fewer red flags, higher score).",
      "2) Where I should be extra cautious or de-risk (weakening/broken thesis, bearish signals, broken promises).",
      "3) Blind spots or data gaps per stock.",
      "4) 5–7 bullet next actions (process-level, not specific buy/sell instructions).",
      "Acknowledge uncertainty and that this is my research notes, not verified facts.",
    ].join(" "),

    portfolio_ranking,

    portfolio_summary: {
      stock_count: filteredStocks.length,
      avg_thesis_score: avgScore,
      counts_by_thesis_status: {
        strengthening: byStatus.Strengthening.length,
        stable: byStatus.Stable.length,
        weakening: byStatus.Weakening.length,
        broken: byStatus.Broken.length,
      },
      capitalize_more_candidates: capitalizeMore.map(brief),
      stay_cautious_candidates: stayCautious.map(brief),
      balanced_or_watch: balanced.map(brief),
    },

    stocks: stocksPayload,

    meta: {
      filter: "only_stocks_with_at_least_one_quarterly_snapshot",
      stocks_in_portfolio_total: stocks.length,
      stocks_omitted_no_quarterly_json: stocks.length - filteredStocks.length,
      include_raw_snapshot_json: includeRawSnapshots,
      note: includeRawSnapshots
        ? "Each quarterly_snapshots[].raw_ai_output is the full Gemini/import JSON for that quarter."
        : "Quarterly rows omit raw_ai_output for size; use include_raw_snapshot_json export for full JSON. Stocks without any quarterly import are excluded from this export.",
    },
  };
}
