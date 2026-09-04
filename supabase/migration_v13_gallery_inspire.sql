-- ============================================================
-- NAILUXE v13 — GALLERY UPGRADE (INSPIRATION & BULK SUPPORT)
-- Adds 'type' column to differentiate Client Showcase vs Ideas/Inspiration
-- ============================================================

ALTER TABLE public.gallery
ADD COLUMN IF NOT EXISTS type text DEFAULT 'showcase' CHECK (type IN ('showcase', 'inspire'));

CREATE INDEX IF NOT EXISTS idx_gallery_type ON public.gallery(type);
