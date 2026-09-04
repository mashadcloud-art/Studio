-- migration_v6.sql
-- Fixes "booking cannot be completed": adds columns the app writes when a staff
-- member completes a booking, and a staff-scoped UPDATE policy so they're allowed
-- to write to their own assigned bookings.

alter table public.bookings add column if not exists started_at timestamptz;
alter table public.bookings add column if not exists work_record_id uuid references public.work_records(id) on delete set null;
alter table public.bookings add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid'));

drop policy if exists "bookings_staff_update" on public.bookings;
create policy "bookings_staff_update" on public.bookings
  for update using (assigned_staff_id = auth.uid())
  with check (assigned_staff_id = auth.uid());
