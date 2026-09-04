-- ============================================================
-- NAILUXE v14 — Run this in Supabase SQL Editor
-- ============================================================
-- Multiple check-in/check-out cycles per staff per day (e.g. arriving,
-- leaving for lunch, coming back), so pay is based on total hours actually
-- worked that day rather than a single check-in/check-out pair.
--
-- `public.attendance` (one row per staff per day) stays exactly as it is and
-- keeps being the record for status (Present/Absent/Late/...) and overtime
-- approval. Its own check_in/check_out columns now just MIRROR whichever
-- session is most recent (null check_out = currently on duty), purely so
-- every other screen that asks "is she online right now" (Team page, chat
-- badge, her own profile) keeps working unchanged — they were never rewired
-- to read this new table, and don't need to be.
--
-- `public.attendance_sessions` is the new source of truth for hours: every
-- real check-in → check-out cycle, one row each. Overtime and Payroll sum
-- these per staff per day instead of a single check_in/check_out diff.

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id           uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date               date NOT NULL,
  check_in           timestamptz NOT NULL,
  check_out          timestamptz,
  location_verified  boolean NOT NULL DEFAULT false,
  check_in_lat       double precision,
  check_in_lng       double precision,
  check_out_lat      double precision,
  check_out_lng      double precision,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Idempotent safety net in case this table already exists from a partial run.
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS check_in_lat double precision;
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS check_in_lng double precision;
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS check_out_lat double precision;
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS check_out_lng double precision;

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_staff_date ON public.attendance_sessions(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date      ON public.attendance_sessions(date);

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Same access shape as `attendance` itself: a staff member can see and add
-- their own sessions; an admin/receptionist can see and manage everyone's
-- (manual corrections from the Attendance page).
DROP POLICY IF EXISTS "attendance_sessions_select" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_select" ON public.attendance_sessions
  FOR SELECT USING (staff_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "attendance_sessions_insert" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_insert" ON public.attendance_sessions
  FOR INSERT WITH CHECK (staff_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "attendance_sessions_update" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_update" ON public.attendance_sessions
  FOR UPDATE USING (staff_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "attendance_sessions_delete" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_delete" ON public.attendance_sessions
  FOR DELETE USING (public.is_admin());

-- ------------------------------------------------------------------
-- Payroll: present_days/absent_days now hold fractional day-credits
-- (e.g. 21.5), not just whole-number counts, since Payroll now prices a
-- short day at part of a day's pay instead of only tracking full absences.
-- Safe to run whether these were integer or already numeric.
-- ------------------------------------------------------------------
ALTER TABLE public.payroll ALTER COLUMN present_days TYPE numeric(6,2);
ALTER TABLE public.payroll ALTER COLUMN absent_days TYPE numeric(6,2);
