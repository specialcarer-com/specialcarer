-- 20260511_payments_kind_and_booking_force_flags_v1 — payment supplemental
-- kinds + booking forced check-in/out flags. Applied via Supabase MCP 2026-05-11.

DO $$ BEGIN
  CREATE TYPE payment_kind AS ENUM ('primary', 'overage', 'overtime', 'tip', 'refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS kind payment_kind NOT NULL DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS parent_payment_id uuid REFERENCES payments(id),
  ADD COLUMN IF NOT EXISTS timesheet_id uuid REFERENCES shift_timesheets(id);

CREATE INDEX IF NOT EXISTS idx_payments_kind ON payments(kind);
CREATE INDEX IF NOT EXISTS idx_payments_timesheet ON payments(timesheet_id);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS check_in_forced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_in_forced_reason text,
  ADD COLUMN IF NOT EXISTS check_out_forced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_out_forced_reason text,
  ADD COLUMN IF NOT EXISTS flagged_for_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_flagged ON bookings(flagged_for_review)
  WHERE flagged_for_review = true;
