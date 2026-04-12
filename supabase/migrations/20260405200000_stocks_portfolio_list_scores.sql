-- Cross-portfolio list rank from consolidated score (latest quarter + trajectory).
-- Filled by: npm run ranks:quarterly:apply (backend/scripts/compute-quarterly-ranks.js)

ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS portfolio_consolidated_score double precision,
  ADD COLUMN IF NOT EXISTS portfolio_trajectory_bonus double precision,
  ADD COLUMN IF NOT EXISTS portfolio_latest_quarter_sort_score double precision,
  ADD COLUMN IF NOT EXISTS portfolio_list_rank integer,
  ADD COLUMN IF NOT EXISTS portfolio_list_cohort_size integer,
  ADD COLUMN IF NOT EXISTS portfolio_scores_updated_at timestamptz;

COMMENT ON COLUMN stocks.portfolio_consolidated_score IS 'Latest-quarter thesis×1000+confidence + trajectory bonus; higher = better.';
COMMENT ON COLUMN stocks.portfolio_trajectory_bonus IS 'Trajectory component only (see snapshotPortfolioRank.ts).';
COMMENT ON COLUMN stocks.portfolio_latest_quarter_sort_score IS 'Latest quarter score before trajectory.';
COMMENT ON COLUMN stocks.portfolio_list_rank IS 'Rank among stocks with ≥1 snapshot after last batch (#1 = best consolidated).';
COMMENT ON COLUMN stocks.portfolio_list_cohort_size IS 'Number of stocks ranked in that batch.';
COMMENT ON COLUMN stocks.portfolio_scores_updated_at IS 'When ranks:quarterly:apply last wrote these columns.';
