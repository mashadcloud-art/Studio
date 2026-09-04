-- ============================================================
-- NAILUXE STUDIO — GALLERY TABLE SCHEMA & STARTER DATA
-- Run this in Supabase SQL Editor to enable shared gallery storage across all devices!
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name text NOT NULL DEFAULT 'Salon Stylist',
  client_name text,
  style_tag text DEFAULT 'General Style',
  notes text,
  type text DEFAULT 'showcase' CHECK (type IN ('showcase', 'inspire')),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon users
DROP POLICY IF EXISTS "Allow public read on gallery" ON public.gallery;
CREATE POLICY "Allow public read on gallery" ON public.gallery FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on gallery" ON public.gallery;
CREATE POLICY "Allow public insert on gallery" ON public.gallery FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on gallery" ON public.gallery;
CREATE POLICY "Allow public update on gallery" ON public.gallery FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete on gallery" ON public.gallery;
CREATE POLICY "Allow public delete on gallery" ON public.gallery FOR DELETE USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery;

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_gallery_staff ON public.gallery(staff_id);
CREATE INDEX IF NOT EXISTS idx_gallery_type ON public.gallery(type);
CREATE INDEX IF NOT EXISTS idx_gallery_created ON public.gallery(created_at DESC);
