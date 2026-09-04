-- ============================================================
-- NAILUXE v3 — Run this in Supabase SQL Editor
-- ============================================================

-- Add speciality to staff
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS speciality text DEFAULT 'General';

-- Update role to include receptionist
ALTER TABLE public.staff
DROP CONSTRAINT IF EXISTS staff_role_check;

ALTER TABLE public.staff
ADD CONSTRAINT staff_role_check 
CHECK (role IN ('admin', 'staff', 'receptionist'));

-- Bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name   text NOT NULL,
  customer_phone  text NOT NULL,
  customer_place  text,
  booking_date    date NOT NULL,
  booking_time    time NOT NULL,
  services        jsonb NOT NULL DEFAULT '[]'::jsonb,
  advance_paid    numeric(10,2) NOT NULL DEFAULT 0,
  pending_amount  numeric(10,2) NOT NULL DEFAULT 0,
  assigned_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending' 
                  CHECK (status IN ('pending','confirmed','completed','cancelled')),
  notes           text,
  created_by      uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS for bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Admin and receptionist can do everything
CREATE POLICY "bookings_admin_receptionist" ON public.bookings
  FOR ALL USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.staff 
      WHERE id = auth.uid() AND role = 'receptionist' AND active = true
    )
  );

-- Staff can see bookings assigned to them
CREATE POLICY "bookings_staff_own" ON public.bookings
  FOR SELECT USING (assigned_staff_id = auth.uid());

-- Add photo_url and extra_services to work_records if not exists
ALTER TABLE public.work_records 
ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE public.work_records
ADD COLUMN IF NOT EXISTS extra_services jsonb DEFAULT '[]'::jsonb;

-- Receptionist permissions table (which features they can access)
CREATE TABLE IF NOT EXISTS public.receptionist_permissions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  can_view_bookings    boolean DEFAULT true,
  can_create_bookings  boolean DEFAULT true,
  can_view_customers   boolean DEFAULT true,
  can_view_services    boolean DEFAULT true,
  can_view_staff       boolean DEFAULT false,
  can_view_reports     boolean DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id)
);

ALTER TABLE public.receptionist_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receptionist_perms_admin" ON public.receptionist_permissions
  FOR ALL USING (public.is_admin());

CREATE POLICY "receptionist_perms_own" ON public.receptionist_permissions
  FOR SELECT USING (staff_id = auth.uid());
