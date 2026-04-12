-- Cross-portfolio rank within each fiscal quarter (computed by scripts/compute-quarterly-ranks.js).
-- Rank 1 = highest score in that quarter's cohort. Ties share the same rank (competition ranking).

ALTER TABLE quarterly_snapshots
  ADD COLUMN IF NOT EXISTS portfolio_rank integer,
  ADD COLUMN IF NOT EXISTS portfolio_cohort_size integer,
  ADD COLUMN IF NOT EXISTS portfolio_rank_score double precision;

COMMENT ON COLUMN quarterly_snapshots.portfolio_rank IS 'Rank within same quarter label across all stocks (1 = best).';
COMMENT ON COLUMN quarterly_snapshots.portfolio_cohort_size IS 'Number of distinct stocks ranked in that quarter.';
COMMENT ON COLUMN quarterly_snapshots.portfolio_rank_score IS 'Numeric score used for ranking (usually snapshot confidence).';
