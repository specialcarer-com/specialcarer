-- 20260511_shift_time_adjustments_v1 — either-party time-correction log.
-- Applied via Supabase MCP 2026-05-11.

DO $$ BEGIN
  CREATE TYPE adjustment_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS shift_time_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES shift_timesheets(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  proposer_user_id uuid NOT NULL REFERENCES auth.users(id),
  proposer_role text NOT NULL,
  proposed_start timestamptz NOT NULL,
  proposed_end timestamptz NOT NULL,
  proposed_minutes int NOT NULL,
  reason text NOT NULL,
  status adjustment_status NOT NULL DEFAULT 'pending',
  responder_user_id uuid REFERENCES auth.users(id),
  responded_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adjustments_timesheet ON shift_time_adjustments(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_status ON shift_time_adjustments(status);

ALTER TABLE shift_time_adjustments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "adj: parties read own booking adjustments"
    ON shift_time_adjustments FOR SELECT USING (EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = shift_time_adjustments.booking_id
        AND (b.seeker_id = auth.uid() OR b.caregiver_id = auth.uid()
          OR EXISTS (SELECT 1 FROM organization_members om
                     WHERE om.organization_id = b.organization_id AND om.user_id = auth.uid()))
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "adj: admin reads all"
    ON shift_time_adjustments FOR SELECT USING (EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
