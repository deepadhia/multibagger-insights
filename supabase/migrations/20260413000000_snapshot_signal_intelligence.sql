-- Add 3 new intelligence signal columns to quarterly_snapshots
-- primary_metric_momentum: tracks second derivative (accelerating/decelerating/stable)
-- thesis_dependency: tracks what drives the thesis and its reliability
-- execution_quality: tracks operational efficiency (with applicability flag for cross-sector)

ALTER TABLE quarterly_snapshots
  ADD COLUMN IF NOT EXISTS primary_metric_momentum JSONB,
  ADD COLUMN IF NOT EXISTS thesis_dependency JSONB,
  ADD COLUMN IF NOT EXISTS execution_quality JSONB,
  ADD COLUMN IF NOT EXISTS is_high_risk_thesis BOOLEAN DEFAULT FALSE;
