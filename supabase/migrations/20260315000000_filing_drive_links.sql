-- Store Google Drive links for downloaded filings (updated after upload to Drive)
CREATE TABLE IF NOT EXISTS public.filing_drive_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  quarter TEXT NOT NULL,
  filename TEXT NOT NULL,
  drive_file_id TEXT,
  drive_web_link TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, quarter, filename)
);

CREATE INDEX IF NOT EXISTS idx_filing_drive_links_symbol ON public.filing_drive_links(symbol);

ALTER TABLE public.filing_drive_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to filing_drive_links" ON public.filing_drive_links FOR ALL USING (true) WITH CHECK (true);
