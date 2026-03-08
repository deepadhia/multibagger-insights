
CREATE TABLE public.quarterly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  quarter text NOT NULL,
  summary text,
  dodged_questions jsonb DEFAULT '[]'::jsonb,
  red_flags jsonb DEFAULT '[]'::jsonb,
  metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stock_id, quarter)
);

ALTER TABLE public.quarterly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to quarterly_snapshots"
  ON public.quarterly_snapshots FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE public.management_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.stocks(id) ON DELETE CASCADE,
  promise_text text NOT NULL,
  made_in_quarter text NOT NULL,
  target_deadline text,
  status text NOT NULL DEFAULT 'pending',
  resolved_in_quarter text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.management_promises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to management_promises"
  ON public.management_promises FOR ALL
  USING (true) WITH CHECK (true);
