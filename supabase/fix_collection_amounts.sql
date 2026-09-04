-- Fix collection amounts on existing bookings and populate work records for revenue tracking

BEGIN;

-- 1. Fix pending collection amounts on the bookings
UPDATE public.bookings 
SET pending_amount = 3600 
WHERE customer_name = 'priya k';

UPDATE public.bookings 
SET pending_amount = 1050 
WHERE customer_name = 'DIYA';

UPDATE public.bookings 
SET pending_amount = 3120 
WHERE customer_name = 'NANDA';

UPDATE public.bookings 
SET pending_amount = 2820 
WHERE customer_name = 'AJAL';

UPDATE public.bookings 
SET pending_amount = 300 
WHERE customer_name = 'NILEEN';

UPDATE public.bookings 
SET pending_amount = 4546 
WHERE customer_name = 'CHITHRA';

-- 2. Populate work_records so the Admin Dashboard & Reports show the revenue (₹15,436 total)
DO $$
DECLARE
  v_nimisha_id uuid;
  v_rejeena_id uuid;
  v_saniya_id  uuid;

  v_priya_id   uuid;
  v_diya_id    uuid;
  v_nanda_id   uuid;
  v_ajal_id    uuid;
  v_nileen_id  uuid;
  v_chithra_id uuid;

  v_s_ext_gel uuid;
  v_s_cateye  uuid;
  v_s_rem     uuid;
  v_s_gel_app uuid;
  v_s_art     uuid;
  v_s_overlay uuid;
  v_s_rem_pol uuid;
  v_s_ext6    uuid;
  v_s_pedi    uuid;
BEGIN
  -- Get Staff
  SELECT id INTO v_nimisha_id FROM public.staff WHERE name ILIKE '%NIMISHA%' LIMIT 1;
  SELECT id INTO v_rejeena_id FROM public.staff WHERE name ILIKE '%REJEENA%' LIMIT 1;
  SELECT id INTO v_saniya_id  FROM public.staff WHERE name ILIKE '%SANIYA%' LIMIT 1;

  -- Get Customers
  SELECT id INTO v_priya_id   FROM public.customers WHERE name ILIKE '%priya%' LIMIT 1;
  SELECT id INTO v_diya_id    FROM public.customers WHERE name ILIKE '%DIYA%' LIMIT 1;
  SELECT id INTO v_nanda_id   FROM public.customers WHERE name ILIKE '%NANDA%' LIMIT 1;
  SELECT id INTO v_ajal_id    FROM public.customers WHERE name ILIKE '%AJAL%' LIMIT 1;
  SELECT id INTO v_nileen_id  FROM public.customers WHERE name ILIKE '%NILEEN%' LIMIT 1;
  SELECT id INTO v_chithra_id FROM public.customers WHERE name ILIKE '%CHITHRA%' LIMIT 1;

  -- Get Services
  SELECT id INTO v_s_ext_gel FROM public.services WHERE name ILIKE '%EXTENSION WITH GEL%' LIMIT 1;
  SELECT id INTO v_s_cateye  FROM public.services WHERE name ILIKE '%CAT%EYE%' LIMIT 1;
  SELECT id INTO v_s_rem     FROM public.services WHERE name ILIKE 'REMOVAL' LIMIT 1;
  SELECT id INTO v_s_gel_app FROM public.services WHERE name ILIKE '%GEL APPLICATION%' LIMIT 1;
  SELECT id INTO v_s_art     FROM public.services WHERE name ILIKE '%NAIL ART%' LIMIT 1;
  SELECT id INTO v_s_overlay FROM public.services WHERE name ILIKE '%GEL OVERLAY%' LIMIT 1;
  SELECT id INTO v_s_rem_pol FROM public.services WHERE name ILIKE '%POLISH REMOVAL%' LIMIT 1;
  SELECT id INTO v_s_ext6    FROM public.services WHERE name ILIKE '%EXTENSION 6%' LIMIT 1;
  SELECT id INTO v_s_pedi    FROM public.services WHERE name ILIKE '%DRY PEDICURE%' LIMIT 1;

  -- Clear previous work records to avoid duplicates
  DELETE FROM public.work_records;

  -- 1) priya k - Sep 1 - ₹3,600 (NIMISHA)
  IF v_priya_id IS NOT NULL AND v_nimisha_id IS NOT NULL AND v_s_ext_gel IS NOT NULL THEN
    INSERT INTO public.work_records (staff_id, customer_id, service_id, amount, date, start_time, end_time, payment_method)
    VALUES (v_nimisha_id, v_priya_id, v_s_ext_gel, 3600, '2026-09-01', '2026-09-01 10:00:00+00', '2026-09-01 11:30:00+00', 'gpay');
  END IF;

  -- 2) DIYA - Sep 1 - ₹1,050 (REJEENA)
  IF v_diya_id IS NOT NULL AND v_rejeena_id IS NOT NULL AND v_s_rem IS NOT NULL THEN
    INSERT INTO public.work_records (staff_id, customer_id, service_id, amount, date, start_time, end_time, payment_method)
    VALUES (v_rejeena_id, v_diya_id, v_s_rem, 1050, '2026-09-01', '2026-09-01 11:00:00+00', '2026-09-01 12:15:00+00', 'gpay');
  END IF;

  -- 3) NANDA - Sep 2 - ₹3,120 (NIMISHA)
  IF v_nanda_id IS NOT NULL AND v_nimisha_id IS NOT NULL AND v_s_ext_gel IS NOT NULL THEN
    INSERT INTO public.work_records (staff_id, customer_id, service_id, amount, date, start_time, end_time, payment_method)
    VALUES (v_nimisha_id, v_nanda_id, v_s_ext_gel, 3120, '2026-09-02', '2026-09-02 10:00:00+00', '2026-09-02 11:30:00+00', 'gpay');
  END IF;

  -- 4) AJAL - Sep 2 - ₹2,820 (REJEENA)
  IF v_ajal_id IS NOT NULL AND v_rejeena_id IS NOT NULL AND v_s_overlay IS NOT NULL THEN
    INSERT INTO public.work_records (staff_id, customer_id, service_id, amount, date, start_time, end_time, payment_method)
    VALUES (v_rejeena_id, v_ajal_id, v_s_overlay, 2820, '2026-09-02', '2026-09-02 11:00:00+00', '2026-09-02 12:30:00+00', 'gpay');
  END IF;

  -- 5) NILEEN - Sep 2 - ₹300 (SANIYA)
  IF v_nileen_id IS NOT NULL AND v_saniya_id IS NOT NULL AND v_s_rem_pol IS NOT NULL THEN
    INSERT INTO public.work_records (staff_id, customer_id, service_id, amount, date, start_time, end_time, payment_method)
    VALUES (v_saniya_id, v_nileen_id, v_s_rem_pol, 300, '2026-09-02', '2026-09-02 12:00:00+00', '2026-09-02 12:30:00+00', 'gpay');
  END IF;

  -- 6) CHITHRA - Sep 2 - ₹4,546 (NIMISHA 3896 + SANIYA 650)
  IF v_chithra_id IS NOT NULL AND v_nimisha_id IS NOT NULL AND v_s_ext6 IS NOT NULL THEN
    INSERT INTO public.work_records (staff_id, customer_id, service_id, amount, date, start_time, end_time, payment_method)
    VALUES (v_nimisha_id, v_chithra_id, v_s_ext6, 3896, '2026-09-02', '2026-09-02 13:00:00+00', '2026-09-02 15:00:00+00', 'gpay');
  END IF;
  IF v_chithra_id IS NOT NULL AND v_saniya_id IS NOT NULL AND v_s_pedi IS NOT NULL THEN
    INSERT INTO public.work_records (staff_id, customer_id, service_id, amount, date, start_time, end_time, payment_method)
    VALUES (v_saniya_id, v_chithra_id, v_s_pedi, 650, '2026-09-02', '2026-09-02 13:00:00+00', '2026-09-02 14:00:00+00', 'gpay');
  END IF;

END $$;

COMMIT;
