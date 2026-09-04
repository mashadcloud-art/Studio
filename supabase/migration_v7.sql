-- ============================================================
-- NAILUXE v7 — Run this in Supabase SQL Editor
-- ============================================================
-- 1) Documents the `attendance` table (it already exists live in Supabase —
--    the staff Check In/Out page has been using it — but was never captured
--    in a tracked migration file, so this makes it reproducible and adds
--    the RLS it needs).
-- 2) Adds a per-staff overtime hourly rate, used to turn overtime minutes
--    (worked beyond the `standard_work_hours` setting, default 8h/day) into
--    a payable amount on the Overtime and Payroll pages.

CREATE TABLE IF NOT EXISTS public.attendance (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id           uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date               date NOT NULL,
  check_in           timestamptz,
  check_out          timestamptz,
  status             text NOT NULL DEFAULT 'present',
  check_in_type      text NOT NULL DEFAULT 'normal'
                     CHECK (check_in_type IN ('normal', 'forgot_logout', 'overtime')),
  location_verified  boolean NOT NULL DEFAULT false,
  check_in_lat       double precision,
  check_in_lng       double precision,
  check_out_lat      double precision,
  check_out_lng      double precision,
  overtime_customer  text,
  overtime_service   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, date)
);

-- Idempotent safety net in case the live table predates some of these columns.
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_in_type text NOT NULL DEFAULT 'normal';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_in_lat double precision;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_in_lng double precision;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_out_lat double precision;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS check_out_lng double precision;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS overtime_customer text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS overtime_service text;

CREATE INDEX IF NOT EXISTS idx_attendance_staff_id ON public.attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date      ON public.attendance(date);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_select" ON public.attendance;
CREATE POLICY "attendance_select" ON public.attendance
  FOR SELECT USING (staff_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "attendance_insert" ON public.attendance;
CREATE POLICY "attendance_insert" ON public.attendance
  FOR INSERT WITH CHECK (staff_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "attendance_update" ON public.attendance;
CREATE POLICY "attendance_update" ON public.attendance
  FOR UPDATE USING (staff_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "attendance_delete" ON public.attendance;
CREATE POLICY "attendance_delete" ON public.attendance
  FOR DELETE USING (public.is_admin());

-- Per-staff overtime hourly rate (used to price out overtime minutes).
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS overtime_rate numeric(10,2) NOT NULL DEFAULT 0;
