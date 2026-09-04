-- ============================================================
-- CREATE OR CONFIGURE ADMIN USER: admin@nailuxe.com
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ============================================================

DO $$
DECLARE
  v_user_id uuid;
  -- Default password is set to HEERnuh@2025 (you can change this to any password you prefer)
  v_password text := 'HEERnuh@2025';
  v_email text := 'admin@nailuxe.com';
BEGIN
  -- 1. Check if user already exists in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    -- Generate new UUID for the admin user
    v_user_id := gen_random_uuid();

    -- Insert into auth.users with confirmed email and encrypted password
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Studio Admin"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    RAISE NOTICE 'Created auth.users record for % with ID %', v_email, v_user_id;
  ELSE
    -- User exists, update password and ensure email is confirmed
    UPDATE auth.users
    SET 
      encrypted_password = crypt(v_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_user_id;

    RAISE NOTICE 'Updated existing auth.users record for % with ID %', v_email, v_user_id;
  END IF;

  -- 2. Upsert into public.staff with role = 'admin'
  INSERT INTO public.staff (
    id,
    name,
    phone,
    joining_date,
    salary,
    role,
    active,
    speciality
  )
  VALUES (
    v_user_id,
    'Studio Admin',
    '9999999999',
    current_date,
    0,
    'admin',
    true,
    'Manager'
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    role = 'admin',
    active = true,
    name = EXCLUDED.name,
    speciality = 'Manager';

  RAISE NOTICE 'Admin user % is now configured with full admin permissions.', v_email;
END $$;
