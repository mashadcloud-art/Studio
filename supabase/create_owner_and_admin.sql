-- ====================================================================
-- CREATE / CONFIGURE ADMIN & OWNER USERS:
-- 1. owner@nailuxe.com (Password: password123)
-- 2. admin@nailuxe.com (Password: password123)
-- 
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_owner_id uuid;
  v_admin_id uuid;
BEGIN
  -- ==================================================================
  -- 1. CONFIGURE: owner@nailuxe.com
  -- ==================================================================
  SELECT id INTO v_owner_id FROM auth.users WHERE email = 'owner@nailuxe.com';

  IF v_owner_id IS NULL THEN
    v_owner_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      v_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'owner@nailuxe.com', crypt('password123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"name":"Studio Owner"}', now(), now(),
      '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET 
      encrypted_password = crypt('password123', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_owner_id;
  END IF;

  -- Ensure owner exists in public.staff with admin role
  INSERT INTO public.staff (id, name, phone, address, joining_date, salary, role, active, speciality, staff_code)
  VALUES (v_owner_id, 'Studio Owner', '9847000000', 'Pamnambili, Kochi', current_date, 0, 'admin', true, 'Owner', 'NLX-01')
  ON CONFLICT (id) DO UPDATE
  SET 
    role = 'admin',
    active = true,
    speciality = 'Owner';

  -- ==================================================================
  -- 2. CONFIGURE: admin@nailuxe.com
  -- ==================================================================
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@nailuxe.com';

  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@nailuxe.com', crypt('password123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"name":"Admin"}', now(), now(),
      '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET 
      encrypted_password = crypt('password123', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_admin_id;
  END IF;

  -- Ensure admin exists in public.staff with admin role
  INSERT INTO public.staff (id, name, phone, address, joining_date, salary, role, active, speciality, staff_code)
  VALUES (v_admin_id, 'Admin', '9847000001', 'Kochi', current_date, 0, 'admin', true, 'Manager', 'NLX-00')
  ON CONFLICT (id) DO UPDATE
  SET 
    role = 'admin',
    active = true,
    speciality = 'Manager';

  RAISE NOTICE 'SUCCESS: owner@nailuxe.com and admin@nailuxe.com are now active with full Admin access and password: password123';
END $$;
