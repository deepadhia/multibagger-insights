CREATE TABLE public.shareholding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_id UUID NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL,
  promoters NUMERIC,
  fiis NUMERIC,
  diis NUMERIC,
  public_holding NUMERIC,
  others NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (stock_id, quarter)
);

ALTER TABLE public.shareholding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to shareholding" ON public.shareholding FOR ALL USING (true) WITH CHECK (true);