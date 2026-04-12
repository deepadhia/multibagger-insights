import { latestSnapshotQuarterContext, type SnapshotRowLike } from "@/lib/snapshotPortfolioRank";

export type StockWithPortfolioFields = {
  id: string;
  ticker: string;
  company_name: string;
  sector?: string | null;
  category?: string;
  portfolio_list_rank?: number | null;
  portfolio_list_cohort_size?: number | null;
  portfolio_consolidated_score?: number | null;
  portfolio_trajectory_bonus?: number | null;
  portfolio_latest_quarter_sort_score?: number | null;
  portfolio_scores_updated_at?: string | null;
};

export type RankingLeaderboardEntry = {
  live_rank: number;
  ticker: string;
  company_name: string;
  sector: string | null;
  /** Live consolidated = latest quarter (thesis×1000 + confidence) + trajectory bonus */
  consolidated_sort_score: number;
  latest_quarter_sort_score: number;
  trajectory_bonus: number;
  latest_quarter: string;
  thesis_status: string | null;
  actionable_decision: string | null;
  actionable_conviction: string | null;
  /** Within that quarter’s import cohort (#1 best), from snapshot row */
  quarter_cohort_rank: number | null;
  quarter_cohort_size: number | null;
  /** Last `ranks:quarterly:apply` batch on stocks table (null if never run) */
  saved_list_rank: number | null;
  saved_list_cohort_size: number | null;
  saved_consolidated_score: number | null;
  saved_at: string | null;
  /** Short human-readable “why” for this position */
  ranking_rationale: string;
};

function buildRationale(ctx: NonNullable<ReturnType<typeof latestSnapshotQuarterContext>>): string {
  const thesis = ctx.thesisStatus || "unknown thesis";
  const conf = ctx.sortScore % 1000;
  const tier = Math.floor(ctx.sortScore / 1000);
  const tierLabel = ["none", "broken", "weakening", "stable", "strengthening"][tier] || "mixed";
  const traj =
    ctx.trajectoryBonus === 0
      ? "flat trajectory vs prior quarters"
      : ctx.trajectoryBonus > 0
        ? `positive trajectory (+${ctx.trajectoryBonus}) across recent quarters`
        : `negative trajectory (${ctx.trajectoryBonus}) across recent quarters`;
  const verdict =
    ctx.verdict.decision != null
      ? ` Gemini verdict: ${ctx.verdict.decision}${ctx.verdict.convictionLevel ? ` (${ctx.verdict.convictionLevel})` : ""}.`
      : "";
  return `Latest import ${ctx.quarter}: ${thesis} (tier≈${tierLabel}, conf~${conf}). ${traj}.${verdict} Higher consolidated score ranks higher.`;
}

/** Competition ranks on pre-sorted (desc) leaderboard: 1,1,3 for tied scores */
function assignCompetitionRanks(sorted: RankingLeaderboardEntry[]): void {
  let prevScore: number | null = null;
  let currentRank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (prevScore === null || r.consolidated_sort_score !== prevScore) {
      currentRank = i + 1;
      prevScore = r.consolidated_sort_score;
    }
    r.live_rank = currentRank;
  }
}

export type PortfolioRankingBlock = {
  methodology: {
    summary: string;
    latest_quarter_score: string;
    trajectory: string;
    quarter_cohort_rank: string;
    saved_batch: string;
  };
  leaderboard: RankingLeaderboardEntry[];
  highest_consolidated: { ticker: string; company_name: string; consolidated_sort_score: number } | null;
};

/**
 * Stocks must already be restricted to names with ≥1 quarterly snapshot (caller filters).
 */
export function buildPortfolioRankingBlock(
  stocks: StockWithPortfolioFields[],
  allSnapshots: SnapshotRowLike[],
): PortfolioRankingBlock {
  const methodology = {
    summary:
      "Live ordering uses consolidated_sort_score = (thesis tier × 1000 + confidence on latest fiscal quarter) + trajectory_bonus from up to 5 recent quarters (upgrades rewarded, downgrades penalized, bonus for non-decreasing tier path).",
    latest_quarter_score:
      "Thesis tiers: strengthening=4, stable=3, weakening=2, broken=1, unknown=0. Confidence is 0–100 from snapshot or raw JSON.",
    trajectory:
      "Trajectory matches backend/scripts/compute-quarterly-ranks.js and src/lib/snapshotPortfolioRank.ts.",
    quarter_cohort_rank:
      "quarter_cohort_rank is # within stocks that have a snapshot for that same quarter label (thesis-first score); run npm run ranks:quarterly:apply to refresh.",
    saved_batch:
      "saved_* fields are the last DB batch from ranks:quarterly:apply (stocks.portfolio_*). Re-run after adds or new imports.",
  };

  const leaderboard: RankingLeaderboardEntry[] = [];

  for (const stock of stocks) {
    const snaps = (allSnapshots || []).filter((s) => s.stock_id === stock.id);
    const ctx = latestSnapshotQuarterContext(snaps);
    if (!ctx) continue;

    const pr = ctx.portfolioRank;
    leaderboard.push({
      live_rank: 0,
      ticker: stock.ticker,
      company_name: stock.company_name,
      sector: stock.sector ?? null,
      consolidated_sort_score: ctx.consolidatedSortScore,
      latest_quarter_sort_score: ctx.sortScore,
      trajectory_bonus: ctx.trajectoryBonus,
      latest_quarter: ctx.quarter,
      thesis_status: ctx.thesisStatus,
      actionable_decision: ctx.verdict.decision,
      actionable_conviction: ctx.verdict.convictionLevel,
      quarter_cohort_rank: pr?.rank ?? null,
      quarter_cohort_size: pr?.cohortSize ?? null,
      saved_list_rank: stock.portfolio_list_rank ?? null,
      saved_list_cohort_size: stock.portfolio_list_cohort_size ?? null,
      saved_consolidated_score: stock.portfolio_consolidated_score ?? null,
      saved_at: stock.portfolio_scores_updated_at ?? null,
      ranking_rationale: buildRationale(ctx),
    });
  }

  leaderboard.sort((a, b) => {
    if (b.consolidated_sort_score !== a.consolidated_sort_score) {
      return b.consolidated_sort_score - a.consolidated_sort_score;
    }
    return a.ticker.localeCompare(b.ticker, undefined, { sensitivity: "base" });
  });
  assignCompetitionRanks(leaderboard);

  const top = leaderboard[0];
  const highest_consolidated = top
    ? { ticker: top.ticker, company_name: top.company_name, consolidated_sort_score: top.consolidated_sort_score }
    : null;

  return { methodology, leaderboard, highest_consolidated };
}

export function buildStandaloneRankingClipboardPayload(
  stocks: StockWithPortfolioFields[],
  allSnapshots: SnapshotRowLike[],
) {
  const block = buildPortfolioRankingBlock(stocks, allSnapshots);
  return {
    generated_at: new Date().toISOString(),
    source: "multibagger-insights",
    purpose:
      "Portfolio ranking leaderboard with per-stock rationale (thesis, trajectory, verdicts). Use as research context only—not investment advice.",
    suggested_prompt_for_ai: [
      "Using ONLY this JSON, summarize the portfolio ranking: who leads on consolidated score and why (thesis + trajectory).",
      "Call out names with strong positive trajectory vs those sliding.",
      "Contrast live_rank vs saved_list_rank if they differ (saved batch may be stale until ranks:quarterly:apply).",
      "5 bullets max; no buy/sell instructions.",
    ].join(" "),
    ...block,
  };
}
