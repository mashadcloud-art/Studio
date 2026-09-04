-- ============================================================
-- NAILUXE v5 — Run this in Supabase SQL Editor
-- ============================================================
-- Turns the single "owner note" into a two-way chat thread per staff
-- member (owner <-> staff), supporting text and voice-note messages.

CREATE TABLE IF NOT EXISTS public.staff_notes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  sender_id   uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('admin', 'staff')),
  message     text,
  voice_url   text,
  voice_duration integer,  -- seconds, for showing "0:07" before playback
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_notes_has_content CHECK (message IS NOT NULL OR voice_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS staff_notes_staff_id_idx ON public.staff_notes (staff_id, created_at);

ALTER TABLE public.staff_notes ENABLE ROW LEVEL SECURITY;

-- The staff member sees their own thread; admin sees everyone's.
CREATE POLICY "staff_notes_select" ON public.staff_notes
  FOR SELECT USING (staff_id = auth.uid() OR public.is_admin());

-- The staff member can post into their own thread; admin can post into any thread.
CREATE POLICY "staff_notes_insert" ON public.staff_notes
  FOR INSERT WITH CHECK (staff_id = auth.uid() OR public.is_admin());

-- Admin can delete a message (e.g. sent by mistake); staff cannot.
CREATE POLICY "staff_notes_delete" ON public.staff_notes
  FOR DELETE USING (public.is_admin());
