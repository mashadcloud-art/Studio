-- ============================================================
-- NAILUXE v4 — Run this in Supabase SQL Editor
-- ============================================================

-- Owner notes: a free-text note the owner/admin can leave for a staff member,
-- visible to that staff member on their own "My Profile" page (read-only there).
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS owner_notes text;
