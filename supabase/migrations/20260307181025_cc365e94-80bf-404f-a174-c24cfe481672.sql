
-- Create stocks table
CREATE TABLE public.stocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  sector TEXT,
  category TEXT NOT NULL DEFAULT 'Watchlist' CHECK (category IN ('Core', 'Starter', 'Watchlist')),
  buy_price NUMERIC,
  investment_thesis TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create prices table
CREATE TABLE public.prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  volume BIGINT,
  change_percent NUMERIC,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create financial_metrics table
CREATE TABLE public.financial_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  revenue_growth NUMERIC,
  profit_growth NUMERIC,
  roce NUMERIC,
  roe NUMERIC,
  debt_equity NUMERIC,
  promoter_holding NUMERIC,
  free_cash_flow NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transcripts table
CREATE TABLE public.transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL,
  year INTEGER NOT NULL,
  transcript_text TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transcript_analysis table
CREATE TABLE public.transcript_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL,
  year INTEGER,
  growth_drivers JSONB,
  margin_drivers JSONB,
  demand_outlook TEXT,
  capacity_expansion TEXT,
  industry_tailwinds JSONB,
  risks JSONB,
  guidance TEXT,
  important_quotes JSONB,
  management_tone TEXT CHECK (management_tone IN ('Bullish', 'Neutral', 'Cautious')),
  hidden_signals JSONB,
  sentiment_score INTEGER CHECK (sentiment_score >= 1 AND sentiment_score <= 10),
  analysis_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create management_commitments table
CREATE TABLE public.management_commitments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL,
  statement TEXT NOT NULL,
  metric TEXT,
  target_value TEXT,
  timeline TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Achieved', 'Partially Achieved', 'Missed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create financial_results table
CREATE TABLE public.financial_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL,
  revenue NUMERIC,
  ebitda_margin NUMERIC,
  debt NUMERIC,
  capex NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_results ENABLE ROW LEVEL SECURITY;

-- For MVP, allow all authenticated and anonymous access (public dashboard)
CREATE POLICY "Allow all access to stocks" ON public.stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to prices" ON public.prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to financial_metrics" ON public.financial_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to transcripts" ON public.transcripts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to transcript_analysis" ON public.transcript_analysis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to management_commitments" ON public.management_commitments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to financial_results" ON public.financial_results FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_prices_stock_id ON public.prices(stock_id);
CREATE INDEX idx_prices_date ON public.prices(date);
CREATE INDEX idx_financial_metrics_stock_id ON public.financial_metrics(stock_id);
CREATE INDEX idx_transcripts_stock_id ON public.transcripts(stock_id);
CREATE INDEX idx_transcript_analysis_stock_id ON public.transcript_analysis(stock_id);
CREATE INDEX idx_management_commitments_stock_id ON public.management_commitments(stock_id);
CREATE INDEX idx_financial_results_stock_id ON public.financial_results(stock_id);
