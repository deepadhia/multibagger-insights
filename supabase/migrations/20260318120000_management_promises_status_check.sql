-- ============================================================
-- management_promises: strict status enum constraint
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'management_promises_status_check'
  ) THEN
    ALTER TABLE public.management_promises
    ADD CONSTRAINT management_promises_status_check
    CHECK (status IN ('pending', 'kept', 'broken'));
  END IF;
END$$;

