-- 20260511_shift_timesheets_v1 — approval/dispute table on top of existing
-- check-in/check-out infrastructure. Applied via Supabase MCP 2026-05-11.
-- Documentation copy; the database is already at this state.

DO $$ BEGIN
  CREATE TYPE timesheet_status AS ENUM (
    'pending_approval', 'approved', 'auto_approved', 'disputed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS shift_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  carer_id uuid NOT NULL REFERENCES auth.users(id),
  booking_source text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  actual_start timestamptz NOT NULL,
  actual_end timestamptz NOT NULL,
  actual_minutes int NOT NULL,
  booked_minutes int NOT NULL,
  hourly_rate_cents int NOT NULL,
  currency text NOT NULL,
  overage_minutes int NOT NULL DEFAULT 0,
  overage_cents int NOT NULL DEFAULT 0,
  overage_requires_approval boolean NOT NULL DEFAULT false,
  overage_cap_reason text,
  overtime_minutes int NOT NULL DEFAULT 0,
  overtime_cents int NOT NULL DEFAULT 0,
  gps_verified boolean NOT NULL DEFAULT false,
  forced_check_in boolean NOT NULL DEFAULT false,
  forced_check_out boolean NOT NULL DEFAULT false,
  tasks_completed jsonb NOT NULL DEFAULT '[]'::jsonb,
  carer_notes text,
  carer_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status timesheet_status NOT NULL DEFAULT 'pending_approval',
  auto_approve_at timestamptz NOT NULL,
  approved_at timestamptz,
  approver_user_id uuid REFERENCES auth.users(id),
  approver_typed_reason text,
  approver_ip text,
  tip_cents int NOT NULL DEFAULT 0,
  dispute_reason text,
  dispute_opened_at timestamptz,
  dispute_resolved_at timestamptz,
  dispute_admin_notes text,
  dispute_resolution text,
  pending_adjustment_id uuid,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id)
);

CREATE INDEX IF NOT EXISTS idx_shift_timesheets_auto_approve_at
  ON shift_timesheets(auto_approve_at) WHERE status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_shift_timesheets_booking_id ON shift_timesheets(booking_id);
CREATE INDEX IF NOT EXISTS idx_shift_timesheets_status ON shift_timesheets(status);

ALTER TABLE shift_timesheets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ts: carer reads own"
    ON shift_timesheets FOR SELECT USING (auth.uid() = carer_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "ts: seeker reads booking's timesheet"
    ON shift_timesheets FOR SELECT USING (EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = shift_timesheets.booking_id AND b.seeker_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "ts: org member reads booking's timesheet"
    ON shift_timesheets FOR SELECT USING (EXISTS (
      SELECT 1 FROM bookings b
      JOIN organization_members om ON om.organization_id = b.organization_id
      WHERE b.id = shift_timesheets.booking_id AND om.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "ts: admin reads all"
    ON shift_timesheets FOR SELECT USING (EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
