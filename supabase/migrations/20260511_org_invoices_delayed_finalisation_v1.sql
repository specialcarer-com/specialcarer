-- 20260511_org_invoices_delayed_finalisation_v1 — gate org Stripe Invoice
-- finalisation behind the 48h approval window. Applied via Supabase MCP 2026-05-11.

ALTER TABLE org_invoices
  ADD COLUMN IF NOT EXISTS internal_state text NOT NULL DEFAULT 'finalised',
  ADD COLUMN IF NOT EXISTS finalise_after timestamptz;

-- internal_state values written by app code:
--   'draft_pending_approval' — invoice exists in Stripe as draft, awaiting 48h
--   'finalising'              — about to call finalize_invoice
--   'finalised'               — normal post-finalisation state (default for backfill)

CREATE INDEX IF NOT EXISTS idx_org_invoices_finalise_after
  ON org_invoices(finalise_after)
  WHERE internal_state = 'draft_pending_approval';
