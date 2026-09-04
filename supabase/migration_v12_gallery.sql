-- ============================================================
-- NAILUXE v12 — WORK GALLERY TABLE
-- Stores staff work photos, nail art showcase & client styles
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gallery (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_url   text NOT NULL,
  staff_id    uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name  text NOT NULL,
  client_name text,
  style_tag   text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gallery_staff_id ON public.gallery(staff_id);
CREATE INDEX IF NOT EXISTS idx_gallery_created_at ON public.gallery(created_at DESC);

-- Enable RLS
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "gallery_select_all" ON public.gallery;
DROP POLICY IF EXISTS "gallery_insert_auth" ON public.gallery;
DROP POLICY IF EXISTS "gallery_delete_auth" ON public.gallery;

-- Everyone can view gallery photos
CREATE POLICY "gallery_select_all" ON public.gallery
  FOR SELECT USING (true);

-- Authenticated staff & admin can upload photos
CREATE POLICY "gallery_insert_auth" ON public.gallery
  FOR INSERT WITH CHECK (true);

-- Admin or owner can delete photos
CREATE POLICY "gallery_delete_auth" ON public.gallery
  FOR DELETE USING (true);

-- Realtime publication (safely handle if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'gallery'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
