
ALTER TABLE public.financial_metrics 
ADD COLUMN IF NOT EXISTS revenue numeric,
ADD COLUMN IF NOT EXISTS net_profit numeric,
ADD COLUMN IF NOT EXISTS eps numeric,
ADD COLUMN IF NOT EXISTS opm numeric;
