-- ── v9: Expense edit-approval workflow ──────────────────────────────────
-- A receptionist must request admin approval before editing an existing
-- expense entry. Approving opens a 30-minute edit window for that specific
-- expense only; once it lapses, editing is locked again until a new request
-- is approved. Admins can always edit, no approval needed.

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS edit_approved_by uuid REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS edit_approved_until timestamptz;

-- Row-level guard: admins can always update; anyone else only while an
-- approval window is open on that row. (No-op if RLS isn't enabled on this
-- table — the UI also gates this, this is defense-in-depth.)
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE
  USING (public.is_admin() OR (edit_approved_until IS NOT NULL AND edit_approved_until > now()));

-- Extend the shared notifications table (from v8) to also carry expense-edit
-- requests, alongside the existing overtime-pending notifications.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected'));
