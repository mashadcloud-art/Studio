-- ============================================================
-- NAILUXE v11 — Fix: Gallery uploads not appearing
-- ============================================================
-- Root cause: the Gallery page (src/pages/staff/Gallery.tsx) reads and
-- writes a `public.gallery` table, but that table was never created by
-- any migration (grepped every migration_v*.sql — no mention of
-- "gallery" anywhere). So every upload's DB insert silently fails, the
-- app falls back to saving the photo in that ONE browser's
-- localStorage only, and every gallery fetch also fails and falls
-- back to the built-in sample/curated photos — which is exactly the
-- symptom: you upload, get a success toast, and the gallery still
-- only shows the placeholder demo photos (or nothing on any other
-- device/browser).
--
-- This creates the table (safe to run even if it partially exists
-- already — every column add is IF NOT EXISTS) and sets up RLS so any
-- logged-in staff member can view and upload, and only the uploader
-- or an admin can edit/delete a given photo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gallery (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_url   text NOT NULL,
  staff_id    uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name  text NOT NULL DEFAULT 'Salon Stylist',
  client_name text,
  style_tag   text,
  notes       text,
  type        text NOT NULL DEFAULT 'showcase' CHECK (type IN ('showcase', 'inspire')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Defensive: fill in any columns missing if the table already existed
-- in some partial form (e.g. created by hand in the Supabase dashboard).
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS style_tag text;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'showcase';
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_gallery_staff_id   ON public.gallery(staff_id);
CREATE INDEX IF NOT EXISTS idx_gallery_type        ON public.gallery(type);
CREATE INDEX IF NOT EXISTS idx_gallery_created_at  ON public.gallery(created_at);

ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

-- Any logged-in staff/receptionist/admin can browse the whole gallery
-- (the app itself narrows "My Sets" down to the current stylist client-side).
DROP POLICY IF EXISTS "gallery_select" ON public.gallery;
CREATE POLICY "gallery_select" ON public.gallery
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Any logged-in user can upload a photo.
DROP POLICY IF EXISTS "gallery_insert" ON public.gallery;
CREATE POLICY "gallery_insert" ON public.gallery
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only the person who uploaded it, or an admin, can edit/delete it.
DROP POLICY IF EXISTS "gallery_update" ON public.gallery;
CREATE POLICY "gallery_update" ON public.gallery
  FOR UPDATE USING (staff_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "gallery_delete" ON public.gallery;
CREATE POLICY "gallery_delete" ON public.gallery
  FOR DELETE USING (staff_id = auth.uid() OR public.is_admin());
