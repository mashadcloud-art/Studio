-- ============================================================
-- NAILUXE v8 — Run this in Supabase SQL Editor
-- Overtime approval workflow + in-app notifications for admin/receptionist
-- ============================================================

-- Reusable helper: admin OR receptionist (both can review/approve overtime,
-- matching the existing bookings_admin_receptionist pattern from v3).
CREATE OR REPLACE FUNCTION public.is_admin_or_receptionist()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff
    WHERE id = auth.uid() AND role IN ('admin', 'receptionist') AND active = true
  );
$$;

-- ── Overtime approval state lives on the attendance row itself ─────────────
-- One attendance row per staff per day already holds check_in/check_out;
-- ot_status tracks whether that day's overtime (if any) has been reviewed.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS ot_status text NOT NULL DEFAULT 'none'
    CHECK (ot_status IN ('none', 'pending', 'approved', 'rejected'));

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS ot_reviewed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS ot_reviewed_at timestamptz;

-- Receptionists can now also review/approve overtime, so they need update
-- access on attendance too (previously admin-or-self only).
DROP POLICY IF EXISTS "attendance_update" ON public.attendance;
CREATE POLICY "attendance_update" ON public.attendance
  FOR UPDATE USING (staff_id = auth.uid() OR public.is_admin_or_receptionist());

-- ── In-app notifications (overtime approval requests, and future alerts) ───
CREATE TABLE IF NOT EXISTS public.notifications (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type           text NOT NULL DEFAULT 'overtime_pending',
  title          text NOT NULL,
  body           text,
  staff_id       uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  attendance_id  uuid REFERENCES public.attendance(id) ON DELETE CASCADE,
  read_by        uuid[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Only admin/receptionist are the audience for these — staff don't see this feed.
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (public.is_admin_or_receptionist());

-- A staff member may raise a notification about themselves (e.g. their own
-- overtime crossing the threshold while checked in); admin/receptionist can
-- raise one about anyone.
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (staff_id = auth.uid() OR public.is_admin_or_receptionist());

-- Marking read (appending to read_by) is done by whoever can see the feed.
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (public.is_admin_or_receptionist());

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE USING (public.is_admin());
