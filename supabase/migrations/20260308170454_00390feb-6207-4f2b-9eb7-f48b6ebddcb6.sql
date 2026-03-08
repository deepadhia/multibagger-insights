ALTER TABLE public.quarterly_snapshots
ADD COLUMN IF NOT EXISTS thesis_momentum text,
ADD COLUMN IF NOT EXISTS thesis_drift_status text,
ADD COLUMN IF NOT EXISTS confidence_score integer;