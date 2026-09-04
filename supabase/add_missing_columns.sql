-- ============================================================
-- ADD MISSING COLUMNS TO STAFF TABLE
-- Run this once in your Supabase SQL Editor:
-- ============================================================

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS overtime_rate numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS staff_code text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS speciality text DEFAULT 'General';
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS address text;

-- Reload Supabase API Schema Cache so the new columns are immediately available
NOTIFY pgrst, 'reload config';
