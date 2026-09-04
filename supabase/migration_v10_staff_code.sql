-- ============================================================
-- NAILUXE v10 — Add staff_code to staff table
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add staff_code column if it doesn't already exist
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS staff_code text;

-- 2. Populate default staff codes for existing staff
UPDATE public.staff SET staff_code = 'NLX-01' WHERE name ILIKE '%nimisha%' AND (staff_code IS NULL OR staff_code = '');
UPDATE public.staff SET staff_code = 'NLX-02' WHERE name ILIKE '%rejeena%' AND (staff_code IS NULL OR staff_code = '');
UPDATE public.staff SET staff_code = 'NLX-03' WHERE name ILIKE '%saniya%' AND (staff_code IS NULL OR staff_code = '');

-- 3. Safely ensure staff_notes is in supabase_realtime publication (skips if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_notes;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Already added, ignore safely
END $$;
