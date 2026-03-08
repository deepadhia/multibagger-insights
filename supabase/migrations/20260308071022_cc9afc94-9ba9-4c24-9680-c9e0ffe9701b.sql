CREATE TABLE public.peer_comparison (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  peer_name TEXT NOT NULL,
  peer_slug TEXT,
  cmp NUMERIC,
  pe NUMERIC,
  market_cap NUMERIC,
  div_yield NUMERIC,
  np_qtr NUMERIC,
  qtr_profit_var NUMERIC,
  sales_qtr NUMERIC,
  qtr_sales_var NUMERIC,
  roce NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (stock_id, peer_name)
);

ALTER TABLE public.peer_comparison ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to peer_comparison" ON public.peer_comparison FOR ALL USING (true) WITH CHECK (true);