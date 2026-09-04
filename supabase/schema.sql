-- ============================================================
-- NAILUXE STUDIO MANAGER — SUPABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Staff table (linked to auth.users via id)
create table if not exists public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  phone       text not null,
  address     text,
  joining_date date not null default current_date,
  salary      numeric(10,2) not null default 0,
  role        text not null default 'staff' check (role in ('admin', 'staff')),
  active      boolean not null default true,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Customers table
create table if not exists public.customers (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  phone       text not null unique,
  address     text,
  created_at  timestamptz not null default now()
);

-- Services table
create table if not exists public.services (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  price       numeric(10,2) not null default 0,
  duration    integer not null default 30,  -- minutes
  category    text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Work Records table
create table if not exists public.work_records (
  id          uuid primary key default uuid_generate_v4(),
  staff_id    uuid not null references public.staff(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id  uuid not null references public.services(id) on delete restrict,
  start_time  timestamptz not null,
  end_time    timestamptz,
  amount      numeric(10,2) not null default 0,
  notes       text,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

-- Overtime table
create table if not exists public.overtime (
  id            uuid primary key default uuid_generate_v4(),
  staff_id      uuid not null references public.staff(id) on delete cascade,
  date          date not null,
  total_minutes integer not null default 0,
  created_at    timestamptz not null default now(),
  unique(staff_id, date)
);

-- Settings table
create table if not exists public.settings (
  id          uuid primary key default uuid_generate_v4(),
  key         text not null unique,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- Insert default settings
insert into public.settings (key, value) values
  ('studio_name', 'Nailuxe Studio'),
  ('standard_work_hours', '8'),
  ('work_start_time', '09:00'),
  ('work_end_time', '18:00')
on conflict (key) do nothing;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_work_records_staff_id  on public.work_records(staff_id);
create index if not exists idx_work_records_date       on public.work_records(date);
create index if not exists idx_work_records_customer   on public.work_records(customer_id);
create index if not exists idx_overtime_staff_id       on public.overtime(staff_id);
create index if not exists idx_customers_phone         on public.customers(phone);

-- ============================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================

alter table public.staff        enable row level security;
alter table public.customers    enable row level security;
alter table public.services     enable row level security;
alter table public.work_records enable row level security;
alter table public.overtime     enable row level security;
alter table public.settings     enable row level security;

-- ---------------------------------------------------------------
-- Helper function: check if current user is admin
-- ---------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.staff
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- ---------------------------------------------------------------
-- STAFF policies
-- ---------------------------------------------------------------
create policy "staff_select_own" on public.staff
  for select using (auth.uid() = id or public.is_admin());

create policy "staff_update_own" on public.staff
  for update using (auth.uid() = id or public.is_admin());

create policy "admin_insert_staff" on public.staff
  for insert with check (public.is_admin());

create policy "admin_delete_staff" on public.staff
  for delete using (public.is_admin());

-- ---------------------------------------------------------------
-- CUSTOMERS policies
-- ---------------------------------------------------------------
create policy "customers_select" on public.customers
  for select using (auth.uid() is not null);

create policy "customers_insert" on public.customers
  for insert with check (auth.uid() is not null);

create policy "customers_update" on public.customers
  for update using (public.is_admin());

create policy "customers_delete" on public.customers
  for delete using (public.is_admin());

-- ---------------------------------------------------------------
-- SERVICES policies
-- ---------------------------------------------------------------
create policy "services_select" on public.services
  for select using (auth.uid() is not null);

create policy "services_insert" on public.services
  for insert with check (public.is_admin());

create policy "services_update" on public.services
  for update using (public.is_admin());

create policy "services_delete" on public.services
  for delete using (public.is_admin());

-- ---------------------------------------------------------------
-- WORK RECORDS policies
-- ---------------------------------------------------------------
create policy "work_records_select" on public.work_records
  for select using (staff_id = auth.uid() or public.is_admin());

create policy "work_records_insert" on public.work_records
  for insert with check (staff_id = auth.uid() or public.is_admin());

create policy "work_records_update" on public.work_records
  for update using (staff_id = auth.uid() or public.is_admin());

create policy "work_records_delete" on public.work_records
  for delete using (public.is_admin());

-- ---------------------------------------------------------------
-- OVERTIME policies
-- ---------------------------------------------------------------
create policy "overtime_select" on public.overtime
  for select using (staff_id = auth.uid() or public.is_admin());

create policy "overtime_insert" on public.overtime
  for insert with check (staff_id = auth.uid() or public.is_admin());

create policy "overtime_update" on public.overtime
  for update using (staff_id = auth.uid() or public.is_admin());

create policy "overtime_delete" on public.overtime
  for delete using (public.is_admin());

-- ---------------------------------------------------------------
-- SETTINGS policies
-- ---------------------------------------------------------------
create policy "settings_select" on public.settings
  for select using (auth.uid() is not null);

create policy "settings_upsert" on public.settings
  for all using (public.is_admin());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public)
values ('staff_photos', 'staff_photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('work_photos', 'work_photos', false)
on conflict (id) do nothing;

-- Storage policies
create policy "staff_photos_own" on storage.objects
  for all using (
    bucket_id = 'staff_photos' and
    (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "work_photos_own" on storage.objects
  for all using (
    bucket_id = 'work_photos' and
    (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

-- ============================================================
-- TRIGGER: auto-create staff record when admin creates auth user
-- ============================================================
-- (Staff records are created via the app, not automatically)

-- ============================================================
-- SAMPLE SEED DATA (remove in production)
-- ============================================================
-- After creating auth users manually, insert their UUIDs here:
-- insert into public.staff (id, name, phone, joining_date, salary, role) values
--   ('AUTH_USER_UUID_HERE', 'Admin User', '+1234567890', '2024-01-01', 5000, 'admin');

-- Sample services
insert into public.services (name, price, duration, category) values
  ('Classic Manicure',       25.00,  30, 'Manicure'),
  ('Gel Manicure',           45.00,  60, 'Manicure'),
  ('Classic Pedicure',       35.00,  45, 'Pedicure'),
  ('Gel Pedicure',           55.00,  75, 'Pedicure'),
  ('Acrylic Full Set',       65.00,  90, 'Acrylic Nails'),
  ('Acrylic Fill',           40.00,  60, 'Acrylic Nails'),
  ('Nail Art (per nail)',     5.00,   10, 'Nail Art'),
  ('Nail Art (full set)',    30.00,   45, 'Nail Art'),
  ('Gel Extension Full Set', 75.00, 120, 'Nail Extensions'),
  ('Nail Repair (per nail)', 8.00,   15, 'Nail Repair')
on conflict do nothing;
