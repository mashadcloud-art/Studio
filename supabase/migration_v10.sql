-- ── v10: Per-visit discount tracking on work records ────────────────────
-- Matches the salon's real paper/Excel ledger: Amount, Discount, After
-- Discount, Total, Pay Mode per customer visit. `amount` on work_records
-- already represents the final (after-discount) total that Payroll/Finance
-- read as revenue — this just adds the discount total alongside it so the
-- gross amount and discount are recoverable for reporting.

ALTER TABLE public.work_records ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
