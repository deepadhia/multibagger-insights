
CREATE TABLE public.sector_indices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  index_name text NOT NULL,
  index_symbol text NOT NULL,
  sector text NOT NULL,
  date date NOT NULL,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(index_symbol, date)
);

ALTER TABLE public.sector_indices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to sector_indices" ON public.sector_indices
  FOR ALL USING (true) WITH CHECK (true);
