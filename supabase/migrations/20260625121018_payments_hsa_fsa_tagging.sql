-- 20260614120000_payments_hsa_fsa_tagging — gap 33: HSA/FSA expense tagging.
--
-- US-only seeker feature. Lets the paying family flag eligible care expenses
-- as HSA/FSA-reimbursable and export an annual summary for their plan admin.
-- The flag lives on payments (one row per Stripe PaymentIntent) so the export
-- can total exactly what the family was charged.
--
-- All new columns default to false / null, so existing payment reads/writes
-- and webhook upserts are unaffected.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS hsa_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hsa_tagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS hsa_tagged_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_payments_hsa_eligible ON public.payments(hsa_eligible)
  WHERE hsa_eligible = true;
