-- ============================================================
-- NAILUXE v2 — Run this in Supabase SQL Editor
-- ============================================================

-- Add photo_url to work_records
ALTER TABLE public.work_records 
ADD COLUMN IF NOT EXISTS photo_url text;

-- Add multiple services support (array of service IDs)
ALTER TABLE public.work_records
ADD COLUMN IF NOT EXISTS extra_services jsonb DEFAULT '[]'::jsonb;
-- extra_services stores: [{"service_id": "uuid", "name": "...", "price": 0}]

-- Add avatar_url already exists in staff table
-- (no change needed)

-- RLS for work_records photo update
-- Already covered by existing work_records_update policy
