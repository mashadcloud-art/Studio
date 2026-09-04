-- NOTE: THIS SCRIPT DELETES ALL EXISTING DATA EXCEPT ADMIN STAFF AND SETTINGS.
-- Run this in your Supabase SQL Editor.

BEGIN;

-- 1. Wipe old data
-- Delete child records first to satisfy foreign key constraints (like work_records which has ON DELETE RESTRICT)
DELETE FROM public.work_records;
DELETE FROM public.overtime;
DELETE FROM public.attendance;
DELETE FROM public.staff_notes;
DELETE FROM public.bookings;
DELETE FROM public.services;
DELETE FROM public.customers;

-- Now delete the staff (except admin)
DELETE FROM public.staff WHERE role != 'admin';

-- 2. Create Staff
-- We use gen_random_uuid() for staff IDs. They won't have auth.users accounts, 
-- but they can be used for tracking bookings and revenue.
DO $$
DECLARE
  nimisha_id uuid := gen_random_uuid();
  rejeena_id uuid := gen_random_uuid();
  saniya_id uuid := gen_random_uuid();
  
  -- Customers
  priya_id uuid := gen_random_uuid();
  diya_id uuid := gen_random_uuid();
  nanda_id uuid := gen_random_uuid();
  ajal_id uuid := gen_random_uuid();
  nileen_id uuid := gen_random_uuid();
  chithra_id uuid := gen_random_uuid();

  -- Services
  s_ext_gel_id uuid := gen_random_uuid();
  s_cateye_id uuid := gen_random_uuid();
  s_removal_id uuid := gen_random_uuid();
  s_gel_app_id uuid := gen_random_uuid();
  s_nailart_id uuid := gen_random_uuid();
  s_gel_overlay_id uuid := gen_random_uuid();
  s_gel_polish_rem_id uuid := gen_random_uuid();
  s_ext_6_id uuid := gen_random_uuid();
  s_overlay_4_id uuid := gen_random_uuid();
  s_dry_mani_id uuid := gen_random_uuid();
  s_dry_pedi_id uuid := gen_random_uuid();
  s_reg_polish_rem_id uuid := gen_random_uuid();

BEGIN
  -- Insert Auth Users
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES 
    (nimisha_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nimisha@nailuxe.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    (rejeena_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rejeena@nailuxe.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    (saniya_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'saniya@nailuxe.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  -- Insert Staff
  INSERT INTO public.staff (id, name, phone, joining_date, salary, role, active) VALUES
    (nimisha_id, 'NIMISHA', '0000000001', '2026-09-01', 0, 'staff', true),
    (rejeena_id, 'REJEENA', '0000000002', '2026-09-01', 0, 'staff', true),
    (saniya_id,  'SANIYA',  '0000000003', '2026-09-01', 0, 'staff', true);

  -- Insert Services
  INSERT INTO public.services (id, name, price, duration, category) VALUES
    (s_ext_gel_id, 'EXTENSION WITH GEL POLISH (BOTH HANDS)', 3350, 90, 'Nail Extensions'),
    (s_cateye_id, 'CATE EYE', 600, 30, 'Nail Art'),
    (s_removal_id, 'REMOVAL', 300, 30, 'Manicure'),
    (s_gel_app_id, 'GEL APPLICATION (BOTH HANDS)', 750, 45, 'Manicure'),
    (s_nailart_id, 'NAIL ART TWO FINGER', 120, 15, 'Nail Art'),
    (s_gel_overlay_id, 'GEL OVERLAY ON NATURAL NAIL WITH GEL POLISH', 1950, 60, 'Nail Extensions'),
    (s_gel_polish_rem_id, 'GEL NAIL POLISH REMOVAL', 270, 30, 'Manicure'),
    (s_ext_6_id, 'EXTENSION 6 NAILS', 2100, 60, 'Nail Extensions'),
    (s_overlay_4_id, 'OVERALAY 4 NAILS', 896, 45, 'Nail Extensions'),
    (s_dry_mani_id, 'DRY MANICURE', 300, 30, 'Manicure'),
    (s_dry_pedi_id, 'DRY PEDICURE WITH REGULAR POLISH', 550, 45, 'Pedicure'),
    (s_reg_polish_rem_id, 'REGULAR POLISH REMOVAL', 100, 15, 'Manicure');

  -- Insert Customers
  INSERT INTO public.customers (id, name, phone) VALUES
    (priya_id, 'priya k', '9840700734'),
    (diya_id, 'DIYA', '6238665263'),
    (nanda_id, 'NANDA', '8921847669'),
    (ajal_id, 'AJAL', '9567861227'),
    (nileen_id, 'NILEEN', '9645692907'),
    (chithra_id, 'CHITHRA', '0000000000');

  -- Insert Bookings
  
  -- 1. priya k (NIMISHA) - Sep 1
  INSERT INTO public.bookings (customer_name, customer_phone, booking_date, booking_time, services, advance_paid, pending_amount, assigned_staff_id, status)
  VALUES ('priya k', '9840700734', '2026-09-01', '10:00', 
    jsonb_build_array(
      jsonb_build_object('service_id', s_ext_gel_id, 'name', 'EXTENSION WITH GEL POLISH (BOTH HANDS)', 'price', 3000),
      jsonb_build_object('service_id', s_cateye_id, 'name', 'CATE EYE', 'price', 600)
    ), 0, 3600, nimisha_id, 'completed');

  -- 2. DIYA (REJEENA) - Sep 1
  INSERT INTO public.bookings (customer_name, customer_phone, booking_date, booking_time, services, advance_paid, pending_amount, assigned_staff_id, status)
  VALUES ('DIYA', '6238665263', '2026-09-01', '11:00', 
    jsonb_build_array(
      jsonb_build_object('service_id', s_removal_id, 'name', 'REMOVAL', 'price', 300),
      jsonb_build_object('service_id', s_gel_app_id, 'name', 'GEL APPLICATION (BOTH HANDS)', 'price', 750)
    ), 0, 1050, rejeena_id, 'completed');

  -- 3. NANDA (NIMISHA) - Sep 2
  INSERT INTO public.bookings (customer_name, customer_phone, booking_date, booking_time, services, advance_paid, pending_amount, assigned_staff_id, status)
  VALUES ('NANDA', '8921847669', '2026-09-02', '10:00', 
    jsonb_build_array(
      jsonb_build_object('service_id', s_ext_gel_id, 'name', 'EXTENSION WITH GEL POLISH( BOTH HANDS)', 'price', 3000),
      jsonb_build_object('service_id', s_nailart_id, 'name', 'NAIL ART TWO FINGER', 'price', 120)
    ), 0, 3120, nimisha_id, 'completed');

  -- 4. AJAL (REJEENA) - Sep 2
  INSERT INTO public.bookings (customer_name, customer_phone, booking_date, booking_time, services, advance_paid, pending_amount, assigned_staff_id, status)
  VALUES ('AJAL', '9567861227', '2026-09-02', '11:00', 
    jsonb_build_array(
      jsonb_build_object('service_id', s_gel_overlay_id, 'name', 'GEL OVERLAY ON NATURAL NAIL WITH GEL POLISH', 'price', 1950),
      jsonb_build_object('service_id', s_gel_polish_rem_id, 'name', 'GEL NAIL POLISH REMOVAL', 'price', 270),
      jsonb_build_object('service_id', s_cateye_id, 'name', 'CAT EYE', 'price', 600)
    ), 0, 2820, rejeena_id, 'completed');

  -- 5. NILEEN (SANIYA) - Sep 2
  INSERT INTO public.bookings (customer_name, customer_phone, booking_date, booking_time, services, advance_paid, pending_amount, assigned_staff_id, status)
  VALUES ('NILEEN', '9645692907', '2026-09-02', '12:00', 
    jsonb_build_array(
      jsonb_build_object('service_id', s_gel_polish_rem_id, 'name', 'GEL POLISH REMOVAL', 'price', 300)
    ), 0, 300, saniya_id, 'completed');

  -- 6. CHITHRA (NIMISHA & SANIYA combined) - Sep 2
  INSERT INTO public.bookings (customer_name, customer_phone, booking_date, booking_time, services, advance_paid, pending_amount, assigned_staff_id, status)
  VALUES ('CHITHRA', '0000000000', '2026-09-02', '13:00', 
    jsonb_build_array(
      jsonb_build_object('service_id', s_ext_6_id, 'name', 'EXTENSION 6 NAILS', 'price', 2100),
      jsonb_build_object('service_id', s_overlay_4_id, 'name', 'OVERALAY 4 NAILS', 'price', 896),
      jsonb_build_object('service_id', s_cateye_id, 'name', 'CATEYE BOTH HAND', 'price', 600),
      jsonb_build_object('service_id', s_dry_mani_id, 'name', 'DRY MANICURE', 'price', 300),
      jsonb_build_object('service_id', s_dry_pedi_id, 'name', 'DRY PEDICURE WITH REGULAR POLISH', 'price', 550),
      jsonb_build_object('service_id', s_reg_polish_rem_id, 'name', 'REGULAR POLISH REMOVAL', 'price', 100)
    ), 0, 4546, nimisha_id, 'completed');

  -- Insert Work Records for Dashboard & Staff Reports
  INSERT INTO public.work_records (staff_id, customer_id, service_id, amount, date, start_time, end_time, payment_method) VALUES
    (nimisha_id, priya_id, s_ext_gel_id, 3600, '2026-09-01', '2026-09-01 10:00:00+00', '2026-09-01 11:30:00+00', 'gpay'),
    (rejeena_id, diya_id, s_rem_id, 1050, '2026-09-01', '2026-09-01 11:00:00+00', '2026-09-01 12:15:00+00', 'gpay'),
    (nimisha_id, nanda_id, s_ext_gel_id, 3120, '2026-09-02', '2026-09-02 10:00:00+00', '2026-09-02 11:30:00+00', 'gpay'),
    (rejeena_id, ajal_id, s_gel_overlay_id, 2820, '2026-09-02', '2026-09-02 11:00:00+00', '2026-09-02 12:30:00+00', 'gpay'),
    (saniya_id, nileen_id, s_gel_polish_rem_id, 300, '2026-09-02', '2026-09-02 12:00:00+00', '2026-09-02 12:30:00+00', 'gpay'),
    (nimisha_id, chithra_id, s_ext_6_id, 3896, '2026-09-02', '2026-09-02 13:00:00+00', '2026-09-02 15:00:00+00', 'gpay'),
    (saniya_id, chithra_id, s_dry_pedi_id, 650, '2026-09-02', '2026-09-02 13:00:00+00', '2026-09-02 14:00:00+00', 'gpay');

END $$;

COMMIT;
