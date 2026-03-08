
CREATE TABLE public.insider_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  trade_type text NOT NULL DEFAULT 'insider',
  person_name text NOT NULL,
  person_category text,
  trade_date date NOT NULL,
  securities_type text,
  num_securities numeric,
  avg_price numeric,
  trade_value numeric,
  mode_of_acquisition text,
  exchange text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.insider_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to insider_trades" ON public.insider_trades FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.bulk_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  deal_type text NOT NULL DEFAULT 'bulk',
  deal_date date NOT NULL,
  client_name text NOT NULL,
  buy_sell text,
  quantity numeric,
  avg_price numeric,
  trade_value numeric,
  exchange text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to bulk_deals" ON public.bulk_deals FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_insider_trades_stock ON public.insider_trades(stock_id);
CREATE INDEX idx_bulk_deals_stock ON public.bulk_deals(stock_id);
