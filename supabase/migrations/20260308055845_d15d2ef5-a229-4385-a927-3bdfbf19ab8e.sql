CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_results_stock_quarter ON public.financial_results (stock_id, quarter);

-- Enable pg_cron and pg_net for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;