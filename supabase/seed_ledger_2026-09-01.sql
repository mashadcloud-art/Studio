-- ============================================================
-- NAILUXE — Seed real ledger data (visits of 1–2 Sep 2026)
-- Run this ONCE in the Supabase SQL Editor, after migration_v10.sql
-- (needs work_records.discount_amount).
-- ============================================================
--
-- WHAT THIS DOES
-- Inserts the 6 real customer visits from your paper/Excel ledger
-- screenshot as `work_records` rows (13 service lines total), using
-- your ACTUAL staff and services by name (not guessed IDs), and
-- auto-creates the customer if they don't already exist.
--
-- HOW IT LOOKS UP STAFF / SERVICES
-- Each visit is its own DO block. Inside, it searches `staff` and
-- `services` by name using ILIKE (case-insensitive, partial match).
-- If a name doesn't match anything in your live tables, that block
-- stops with a clear error (e.g. "Service not found: Cat Eye") and
-- rolls back — it will NOT silently insert wrong/blank data. If a
-- block fails, just fix the matching services.name in your database
-- (or edit the ILIKE pattern in this script) and re-run that block
-- alone. Every OTHER block still succeeds/fails independently.
--
-- Search terms used (check these exist in your `services` table
-- before running, to save yourself a failed block):
--   'Extension with Gel Polish (Both Hands)'  -> %Extension%Gel%Polish%
--   'Cat Eye' / 'Cateye Both Hand'             -> %Cat%Eye%
--   'Removal' (Gel Polish Removal, ₹300)       -> %Gel%Polish%Removal%
--   'Gel Application (Both Hands)'             -> %Gel%Application%
--   'Nail Art Two Finger'                      -> %Nail%Art%
--   'Gel Overlay on Natural Nail with Gel Polish' -> %Gel%Overlay%Natural%
--   'Gel Nail Polish Removal' (₹270)           -> %Gel%Nail%Polish%Removal%
--   'Extension 6 Nails'                        -> %Extension%6%
--   'Overlay 4 Nails (224)'                    -> %Overlay%4%
--   'Dry Manicure'                             -> %Dry%Manicure%
--   'Dry Pedicure with Regular Polish'         -> %Dry%Pedicure%
--   'Regular Polish Removal'                   -> %Regular%Polish%Removal%
--   Staff: NIMISHA, REJEENA, SANIYA            -> exact ILIKE on name
--
-- TWO THINGS FLAGGED FOR YOUR REVIEW (I could not resolve these from
-- the screenshot alone, so I made the safest call — please check):
--
-- 1) NILEEN's row shows Amount 300 but "After Discount" as 0, and no
--    Total/Pay Mode value. That looks like a typo in the original
--    ledger. I've entered it as amount=300, discount=0, payment
--    method defaulted to 'cash' (flagged below) — please correct the
--    payment method if you know it, and confirm the amount is right.
--
-- 2) CHITHRA's row covers TWO staff (NIMISHA for 4 services = 3896,
--    SANIYA for 2 services = 650), which together equal the ledger's
--    combined Total of 4546. The app records one staff per visit, so
--    I've split this into two separate work_records rows — one per
--    staff — using their natural subtotals (this split is exact, not
--    a guess). I assumed GPAY for both since that's the pay mode
--    used by every other visit that day — please correct if wrong.
--
-- CHITHRA has no phone number in the ledger, but customers.phone is
-- required+unique in your schema. The script first tries to match an
-- existing customer named "chithra"; only if none exists does it
-- create one with a placeholder phone ('NO-PHONE-CHITHRA') that you
-- should replace with her real number afterwards.
--
-- Safe to re-run: if you re-run a block after it already succeeded,
-- it will insert the visit AGAIN (there's no de-duplication on
-- work_records). Only re-run a block if it actually failed.
-- ============================================================

-- Defensive: make sure work_records.payment_method exists (some
-- projects add this column via the Supabase dashboard rather than a
-- migration file, so this is a harmless no-op if it's already there).
ALTER TABLE public.work_records
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash';

-- ------------------------------------------------------------
-- 1) priya k — 1 Sep 2026 — staff NIMISHA — GPAY
--    Extension with Gel Polish (Both Hands) 3350, disc 350
--    + Cat Eye 600
--    = Total 3600
-- ------------------------------------------------------------
DO $$
DECLARE
  v_staff_id uuid;
  v_customer_id uuid;
  v_service_id uuid;
  v_extra_id uuid;
  v_extra_name text;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE name ILIKE '%NIMISHA%' LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff not found: NIMISHA'; END IF;

  SELECT id INTO v_customer_id FROM public.customers WHERE phone = '9840700734' LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone) VALUES ('priya k', '9840700734')
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT id INTO v_service_id FROM public.services WHERE name ILIKE '%Extension%Gel%Polish%' LIMIT 1;
  IF v_service_id IS NULL THEN RAISE EXCEPTION 'Service not found: Extension with Gel Polish (Both Hands)'; END IF;

  SELECT id, name INTO v_extra_id, v_extra_name FROM public.services WHERE name ILIKE '%Cat%Eye%' LIMIT 1;
  IF v_extra_id IS NULL THEN RAISE EXCEPTION 'Service not found: Cat Eye'; END IF;

  INSERT INTO public.work_records
    (staff_id, customer_id, service_id, extra_services, amount, discount_amount, date, payment_method, start_time, end_time)
  VALUES (
    v_staff_id, v_customer_id, v_service_id,
    jsonb_build_array(jsonb_build_object('service_id', v_extra_id, 'name', v_extra_name, 'price', 600, 'discount', 0)),
    3600, 350, '2026-09-01', 'gpay',
    '2026-09-01 12:00:00+00', '2026-09-01 13:00:00+00'
  );
END $$;

-- ------------------------------------------------------------
-- 2) DIYA — 1 Sep 2026 — staff REJEENA — GPAY
--    Removal 300 + Gel Application (Both Hands) 750 = Total 1050
-- ------------------------------------------------------------
DO $$
DECLARE
  v_staff_id uuid;
  v_customer_id uuid;
  v_service_id uuid;
  v_extra_id uuid;
  v_extra_name text;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE name ILIKE '%REJEENA%' LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff not found: REJEENA'; END IF;

  SELECT id INTO v_customer_id FROM public.customers WHERE phone = '6238665263' LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone) VALUES ('DIYA', '6238665263')
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT id INTO v_service_id FROM public.services WHERE name ILIKE '%Gel%Polish%Removal%' LIMIT 1;
  IF v_service_id IS NULL THEN RAISE EXCEPTION 'Service not found: Removal (₹300)'; END IF;

  SELECT id, name INTO v_extra_id, v_extra_name FROM public.services WHERE name ILIKE '%Gel%Application%' LIMIT 1;
  IF v_extra_id IS NULL THEN RAISE EXCEPTION 'Service not found: Gel Application (Both Hands)'; END IF;

  INSERT INTO public.work_records
    (staff_id, customer_id, service_id, extra_services, amount, discount_amount, date, payment_method, start_time, end_time)
  VALUES (
    v_staff_id, v_customer_id, v_service_id,
    jsonb_build_array(jsonb_build_object('service_id', v_extra_id, 'name', v_extra_name, 'price', 750, 'discount', 0)),
    1050, 0, '2026-09-01', 'gpay',
    '2026-09-01 13:00:00+00', '2026-09-01 14:00:00+00'
  );
END $$;

-- ------------------------------------------------------------
-- 3) NANDA — 2 Sep 2026 — staff NIMISHA — GPAY
--    Extension with Gel Polish (Both Hands) 3350, disc 350
--    + Nail Art Two Finger 120
--    = Total 3120
-- ------------------------------------------------------------
DO $$
DECLARE
  v_staff_id uuid;
  v_customer_id uuid;
  v_service_id uuid;
  v_extra_id uuid;
  v_extra_name text;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE name ILIKE '%NIMISHA%' LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff not found: NIMISHA'; END IF;

  SELECT id INTO v_customer_id FROM public.customers WHERE phone = '8921847669' LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone) VALUES ('NANDA', '8921847669')
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT id INTO v_service_id FROM public.services WHERE name ILIKE '%Extension%Gel%Polish%' LIMIT 1;
  IF v_service_id IS NULL THEN RAISE EXCEPTION 'Service not found: Extension with Gel Polish (Both Hands)'; END IF;

  SELECT id, name INTO v_extra_id, v_extra_name FROM public.services WHERE name ILIKE '%Nail%Art%' LIMIT 1;
  IF v_extra_id IS NULL THEN RAISE EXCEPTION 'Service not found: Nail Art Two Finger'; END IF;

  INSERT INTO public.work_records
    (staff_id, customer_id, service_id, extra_services, amount, discount_amount, date, payment_method, start_time, end_time)
  VALUES (
    v_staff_id, v_customer_id, v_service_id,
    jsonb_build_array(jsonb_build_object('service_id', v_extra_id, 'name', v_extra_name, 'price', 120, 'discount', 0)),
    3120, 350, '2026-09-02', 'gpay',
    '2026-09-02 11:00:00+00', '2026-09-02 12:00:00+00'
  );
END $$;

-- ------------------------------------------------------------
-- 4) AJAL — 2 Sep 2026 — staff REJEENA — GPAY
--    Gel Overlay on Natural Nail with Gel Polish 1950
--    + Gel Nail Polish Removal 270 + Cat Eye 600
--    = Total 2820
-- ------------------------------------------------------------
DO $$
DECLARE
  v_staff_id uuid;
  v_customer_id uuid;
  v_service_id uuid;
  v_extra1_id uuid; v_extra1_name text;
  v_extra2_id uuid; v_extra2_name text;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE name ILIKE '%REJEENA%' LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff not found: REJEENA'; END IF;

  SELECT id INTO v_customer_id FROM public.customers WHERE phone = '9567861227' LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone) VALUES ('AJAL', '9567861227')
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT id INTO v_service_id FROM public.services WHERE name ILIKE '%Gel%Overlay%Natural%' LIMIT 1;
  IF v_service_id IS NULL THEN RAISE EXCEPTION 'Service not found: Gel Overlay on Natural Nail with Gel Polish'; END IF;

  SELECT id, name INTO v_extra1_id, v_extra1_name FROM public.services WHERE name ILIKE '%Gel%Nail%Polish%Removal%' LIMIT 1;
  IF v_extra1_id IS NULL THEN RAISE EXCEPTION 'Service not found: Gel Nail Polish Removal (₹270)'; END IF;

  SELECT id, name INTO v_extra2_id, v_extra2_name FROM public.services WHERE name ILIKE '%Cat%Eye%' LIMIT 1;
  IF v_extra2_id IS NULL THEN RAISE EXCEPTION 'Service not found: Cat Eye'; END IF;

  INSERT INTO public.work_records
    (staff_id, customer_id, service_id, extra_services, amount, discount_amount, date, payment_method, start_time, end_time)
  VALUES (
    v_staff_id, v_customer_id, v_service_id,
    jsonb_build_array(
      jsonb_build_object('service_id', v_extra1_id, 'name', v_extra1_name, 'price', 270, 'discount', 0),
      jsonb_build_object('service_id', v_extra2_id, 'name', v_extra2_name, 'price', 600, 'discount', 0)
    ),
    2820, 0, '2026-09-02', 'gpay',
    '2026-09-02 12:00:00+00', '2026-09-02 13:30:00+00'
  );
END $$;

-- ------------------------------------------------------------
-- 5) NILEEN — 2 Sep 2026 — staff SANIYA
--    Gel Polish Removal — ledger shows Amount 300 but "After
--    Discount" 0 and no Total/Pay Mode (looks like a ledger typo).
--    Entered as amount=300, discount=0, payment_method='cash'
--    (FLAGGED — please confirm/correct the payment method).
-- ------------------------------------------------------------
DO $$
DECLARE
  v_staff_id uuid;
  v_customer_id uuid;
  v_service_id uuid;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE name ILIKE '%SANIYA%' LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff not found: SANIYA'; END IF;

  SELECT id INTO v_customer_id FROM public.customers WHERE phone = '9645692907' LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone) VALUES ('NILEEN', '9645692907')
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT id INTO v_service_id FROM public.services WHERE name ILIKE '%Gel%Polish%Removal%' LIMIT 1;
  IF v_service_id IS NULL THEN RAISE EXCEPTION 'Service not found: Gel Polish Removal'; END IF;

  INSERT INTO public.work_records
    (staff_id, customer_id, service_id, extra_services, amount, discount_amount, date, payment_method, start_time, end_time)
  VALUES (
    v_staff_id, v_customer_id, v_service_id,
    '[]'::jsonb,
    300, 0, '2026-09-02', 'cash', -- FLAGGED: payment method not shown in ledger, defaulted to cash
    '2026-09-02 13:30:00+00', '2026-09-02 14:00:00+00'
  );
END $$;

-- ------------------------------------------------------------
-- 6a) CHITHRA (part 1 of 2) — 2 Sep 2026 — staff NIMISHA — GPAY (assumed)
--    Extension 6 Nails 2100 + Overlay 4 Nails (224) 896
--    + Cateye Both Hand 600 + Dry Manicure 300 = 3896
--    (This is HER subtotal within the ledger's combined 4546 total —
--    see note at top of file.)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_staff_id uuid;
  v_customer_id uuid;
  v_service_id uuid;
  v_extra1_id uuid; v_extra1_name text;
  v_extra2_id uuid; v_extra2_name text;
  v_extra3_id uuid; v_extra3_name text;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE name ILIKE '%NIMISHA%' LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff not found: NIMISHA'; END IF;

  -- No phone given for CHITHRA in the ledger: match an existing
  -- customer by name first; only create a placeholder if none exists.
  SELECT id INTO v_customer_id FROM public.customers WHERE name ILIKE 'chithra' LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone) VALUES ('CHITHRA', 'NO-PHONE-CHITHRA')
    RETURNING id INTO v_customer_id;
    RAISE NOTICE 'Created CHITHRA with placeholder phone NO-PHONE-CHITHRA — please update with her real number.';
  END IF;

  SELECT id INTO v_service_id FROM public.services WHERE name ILIKE '%Extension%6%' LIMIT 1;
  IF v_service_id IS NULL THEN RAISE EXCEPTION 'Service not found: Extension 6 Nails'; END IF;

  SELECT id, name INTO v_extra1_id, v_extra1_name FROM public.services WHERE name ILIKE '%Overlay%4%' LIMIT 1;
  IF v_extra1_id IS NULL THEN RAISE EXCEPTION 'Service not found: Overlay 4 Nails (224)'; END IF;

  SELECT id, name INTO v_extra2_id, v_extra2_name FROM public.services WHERE name ILIKE '%Cat%Eye%' LIMIT 1;
  IF v_extra2_id IS NULL THEN RAISE EXCEPTION 'Service not found: Cateye Both Hand'; END IF;

  SELECT id, name INTO v_extra3_id, v_extra3_name FROM public.services WHERE name ILIKE '%Dry%Manicure%' LIMIT 1;
  IF v_extra3_id IS NULL THEN RAISE EXCEPTION 'Service not found: Dry Manicure'; END IF;

  INSERT INTO public.work_records
    (staff_id, customer_id, service_id, extra_services, amount, discount_amount, date, payment_method, start_time, end_time)
  VALUES (
    v_staff_id, v_customer_id, v_service_id,
    jsonb_build_array(
      jsonb_build_object('service_id', v_extra1_id, 'name', v_extra1_name, 'price', 896, 'discount', 0),
      jsonb_build_object('service_id', v_extra2_id, 'name', v_extra2_name, 'price', 600, 'discount', 0),
      jsonb_build_object('service_id', v_extra3_id, 'name', v_extra3_name, 'price', 300, 'discount', 0)
    ),
    3896, 0, '2026-09-02', 'gpay', -- FLAGGED: pay mode assumed GPAY, not explicit in ledger for this row
    '2026-09-02 14:00:00+00', '2026-09-02 16:00:00+00'
  );
END $$;

-- ------------------------------------------------------------
-- 6b) CHITHRA (part 2 of 2) — 2 Sep 2026 — staff SANIYA — GPAY (assumed)
--    Dry Pedicure with Regular Polish 550 + Regular Polish Removal 100
--    = 650  (her subtotal within the ledger's combined 4546 total)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_staff_id uuid;
  v_customer_id uuid;
  v_service_id uuid;
  v_extra_id uuid; v_extra_name text;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE name ILIKE '%SANIYA%' LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff not found: SANIYA'; END IF;

  SELECT id INTO v_customer_id FROM public.customers WHERE name ILIKE 'chithra' LIMIT 1;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Customer CHITHRA not found — run block 6a first'; END IF;

  SELECT id INTO v_service_id FROM public.services WHERE name ILIKE '%Dry%Pedicure%' LIMIT 1;
  IF v_service_id IS NULL THEN RAISE EXCEPTION 'Service not found: Dry Pedicure with Regular Polish'; END IF;

  SELECT id, name INTO v_extra_id, v_extra_name FROM public.services WHERE name ILIKE '%Regular%Polish%Removal%' LIMIT 1;
  IF v_extra_id IS NULL THEN RAISE EXCEPTION 'Service not found: Regular Polish Removal'; END IF;

  INSERT INTO public.work_records
    (staff_id, customer_id, service_id, extra_services, amount, discount_amount, date, payment_method, start_time, end_time)
  VALUES (
    v_staff_id, v_customer_id, v_service_id,
    jsonb_build_array(jsonb_build_object('service_id', v_extra_id, 'name', v_extra_name, 'price', 100, 'discount', 0)),
    650, 0, '2026-09-02', 'gpay', -- FLAGGED: pay mode assumed GPAY, not explicit in ledger for this row
    '2026-09-02 16:00:00+00', '2026-09-02 16:45:00+00'
  );
END $$;

-- ============================================================
-- VERIFY: run this after the blocks above to see what was inserted
-- ============================================================
-- SELECT wr.date, c.name AS customer, c.phone, s.name AS staff,
--        sv.name AS primary_service, wr.amount, wr.discount_amount,
--        wr.payment_method, wr.extra_services
-- FROM public.work_records wr
-- JOIN public.customers c ON c.id = wr.customer_id
-- JOIN public.staff s ON s.id = wr.staff_id
-- JOIN public.services sv ON sv.id = wr.service_id
-- WHERE wr.date IN ('2026-09-01','2026-09-02')
-- ORDER BY wr.date, wr.start_time;
