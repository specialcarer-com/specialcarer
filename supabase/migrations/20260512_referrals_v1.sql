-- 20260512_referrals_v1 — Referral programme (£20 give / £20 get) + unified
-- activity feed view used by the dashboard Activity widget.
--
-- This migration is intentionally NOT applied by the bot — the parent agent
-- will run it via Supabase MCP. The repo carries it as the source of truth.

-- ─────────────────────────────────────────────────────────────────────
-- Referral codes — one per user, stable identifier shared with friends.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rc: user reads own"
    ON referral_codes FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rc: admin reads all"
    ON referral_codes FOR SELECT USING (EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Writes happen only via service_role (lazy-create on /api/me/referral).

-- ─────────────────────────────────────────────────────────────────────
-- Referral claims — referrer×referred pair, lifecycle pending→qualified.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL REFERENCES referral_codes(code) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES profiles(id),
  referred_id uuid NOT NULL REFERENCES profiles(id) UNIQUE,
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  qualifying_booking_id uuid REFERENCES bookings(id),
  qualified_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','expired','void')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  CHECK (referrer_id <> referred_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_claims_referrer ON referral_claims(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_claims_status ON referral_claims(status);

ALTER TABLE referral_claims ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rcl: parties read own claim"
    ON referral_claims FOR SELECT USING (
      auth.uid() = referrer_id OR auth.uid() = referred_id
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rcl: admin reads all"
    ON referral_claims FOR SELECT USING (EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No public INSERT/UPDATE/DELETE — service_role only.

-- ─────────────────────────────────────────────────────────────────────
-- Referral credits — ledger of £20 awards. Idempotent per (claim, reason).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES referral_claims(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  reason text NOT NULL CHECK (reason IN ('referrer_reward','referee_reward','adjustment')),
  redeemed_at timestamptz,
  redeemed_booking_id uuid REFERENCES bookings(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 months'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Idempotency: a single claim can produce at most one credit per reason.
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_credits_claim_reason
  ON referral_credits(claim_id, reason);
CREATE INDEX IF NOT EXISTS idx_referral_credits_user ON referral_credits(user_id);

ALTER TABLE referral_credits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rcr: user reads own credits"
    ON referral_credits FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "rcr: admin reads all"
    ON referral_credits FOR SELECT USING (EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Available + lifetime balance view.
CREATE OR REPLACE VIEW v_user_credit_balance AS
  SELECT user_id,
         COALESCE(SUM(amount_cents) FILTER (
            WHERE redeemed_at IS NULL AND now() < expires_at
         ), 0) AS available_cents,
         COALESCE(SUM(amount_cents), 0) AS lifetime_cents
    FROM referral_credits
   GROUP BY user_id;

-- ─────────────────────────────────────────────────────────────────────
-- Activity feed — union of carer events relevant to dashboard widget.
-- Limited to last 30 days in source rows (filter in query for full view).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_user_activity_feed AS
  -- Carer checked in (timesheet started)
  SELECT
    b.seeker_id    AS user_id,
    'seeker'::text AS role,
    ts.actual_start AS ts,
    'carer_checked_in'::text AS event_type,
    jsonb_build_object(
      'booking_id', ts.booking_id,
      'carer_id',  ts.carer_id,
      'actual_start', ts.actual_start
    ) AS event_data,
    ts.booking_id AS booking_id
  FROM shift_timesheets ts
  JOIN bookings b ON b.id = ts.booking_id
  WHERE ts.actual_start > now() - interval '30 days'

  UNION ALL
  SELECT b.caregiver_id, 'caregiver', ts.actual_start, 'carer_checked_in',
         jsonb_build_object('booking_id', ts.booking_id,
                            'seeker_id', b.seeker_id,
                            'actual_start', ts.actual_start),
         ts.booking_id
  FROM shift_timesheets ts
  JOIN bookings b ON b.id = ts.booking_id
  WHERE ts.actual_start > now() - interval '30 days'

  -- Carer checked out
  UNION ALL
  SELECT b.seeker_id, 'seeker', ts.actual_end, 'carer_checked_out',
         jsonb_build_object('booking_id', ts.booking_id,
                            'carer_id', ts.carer_id,
                            'minutes', ts.actual_minutes),
         ts.booking_id
  FROM shift_timesheets ts
  JOIN bookings b ON b.id = ts.booking_id
  WHERE ts.actual_end > now() - interval '30 days'

  UNION ALL
  SELECT b.caregiver_id, 'caregiver', ts.actual_end, 'carer_checked_out',
         jsonb_build_object('booking_id', ts.booking_id,
                            'seeker_id', b.seeker_id,
                            'minutes', ts.actual_minutes),
         ts.booking_id
  FROM shift_timesheets ts
  JOIN bookings b ON b.id = ts.booking_id
  WHERE ts.actual_end > now() - interval '30 days'

  -- Time adjustment lodged
  UNION ALL
  SELECT b.seeker_id, 'seeker', adj.created_at, 'shift_time_adjusted',
         jsonb_build_object('booking_id', adj.booking_id,
                            'proposer_role', adj.proposer_role,
                            'reason', adj.reason),
         adj.booking_id
  FROM shift_time_adjustments adj
  JOIN bookings b ON b.id = adj.booking_id
  WHERE adj.created_at > now() - interval '30 days'

  UNION ALL
  SELECT b.caregiver_id, 'caregiver', adj.created_at, 'shift_time_adjusted',
         jsonb_build_object('booking_id', adj.booking_id,
                            'proposer_role', adj.proposer_role,
                            'reason', adj.reason),
         adj.booking_id
  FROM shift_time_adjustments adj
  JOIN bookings b ON b.id = adj.booking_id
  WHERE adj.created_at > now() - interval '30 days'

  -- Booking settled (paid_out)
  UNION ALL
  SELECT b.seeker_id, 'seeker',
         COALESCE(b.paid_out_at, b.updated_at), 'payment_settled',
         jsonb_build_object('booking_id', b.id,
                            'carer_id', b.caregiver_id,
                            'total_cents', b.total_cents),
         b.id
  FROM bookings b
  WHERE b.status = 'paid_out'
    AND COALESCE(b.paid_out_at, b.updated_at) > now() - interval '30 days'

  UNION ALL
  SELECT b.caregiver_id, 'caregiver',
         COALESCE(b.paid_out_at, b.updated_at), 'payment_settled',
         jsonb_build_object('booking_id', b.id,
                            'seeker_id', b.seeker_id,
                            'total_cents', b.total_cents),
         b.id
  FROM bookings b
  WHERE b.status = 'paid_out'
    AND COALESCE(b.paid_out_at, b.updated_at) > now() - interval '30 days';
