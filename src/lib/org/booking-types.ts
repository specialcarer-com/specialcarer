/**
 * Phase B types — org booking flow, service users, long-form shifts.
 *
 * ── Payment architecture (org vs B2C) ────────────────────────────────────────
 * B2C:  Stripe Connect destination charge. Carer paid by Stripe on capture.
 * Org:  All Care 4 U Group Ltd issues a Stripe Invoice to the org (no Connect).
 *       Org pays All Care 4 U Group Ltd directly via Stripe-hosted page.
 *       Carer is paid from All Care 4 U Group Ltd's own funds via the existing
 *       weekly payout cycle — independently of whether the org has paid yet.
 *
 * ── Sleep-in economics (intentional, higher platform margin) ─────────────────
 *   sleep_in_org_charge  default £100  — what org is invoiced (overnight only)
 *   sleep_in_carer_pay   default  £50  — what carer earns   (overnight only)
 *   Platform retains £50 (50% of sleep portion — intentional; higher overhead)
 *   Active hours: standard 75/25 split (unchanged)
 *
 *   Carer pay  (sleep_in): ROUND(subtotal_cents x 0.75) + ROUND(carer_pay x 100)
 *   Org charge (sleep_in): subtotal_cents + ROUND(org_charge x 100)
 *
 * ── Disclosure rules ─────────────────────────────────────────────────────────
 *   org_charge_total_cents — shown to org + admin
 *   carer_pay_total_cents  — shown to carer + admin ONLY; NEVER to org
 *
 * ── Contracting entity ───────────────────────────────────────────────────────
 * All Care 4 U Group Ltd (Companies House 09428739) — legal entity for all
 * B2B invoices/contracts. SpecialCarer is the consumer brand only.
 */

// ── Canonical care verticals ──────────────────────────────────────────────────
export const CARE_CATEGORIES = [
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
] as const;

export type CareCategory = (typeof CARE_CATEGORIES)[number];

export const CARE_CATEGORY_LABEL: Record<CareCategory, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
};

// ── Shift modes ───────────────────────────────────────────────────────────────
export const SHIFT_MODES = [
  "single",
  "twelve_hour",
  "sleep_in",
  "recurring_4w",
] as const;

export type ShiftMode = (typeof SHIFT_MODES)[number];

export const SHIFT_MODE_LABEL: Record<ShiftMode, string> = {
  single: "Standard shift",
  twelve_hour: "12-hour shift",
  sleep_in: "Sleep-in",
  recurring_4w: "4-week recurring",
};

/**
 * Description shown in the booking wizard's shift mode picker.
 * For sleep_in, explicitly breaks down active hours (25% cut) vs the
 * £100 overnight allowance so the org knows what they will be charged.
 */
export const SHIFT_MODE_DESCRIPTION: Record<ShiftMode, string> = {
  single: "Hourly booking, typically up to 8 hours.",
  twelve_hour: "Up to 12 contiguous hours at a single rate.",
  sleep_in:
    "Active care hours billed at your carer's hourly rate, plus a £100 sleep-in allowance for the overnight sleeping period. Total = (active hours x rate) + £100.",
  recurring_4w:
    "28 nightly instances over 4 weeks. Carer accepts the whole pattern; individual nights can be released with 72+ hours notice.",
};

// ── Sleep-in defaults ─────────────────────────────────────────────────────────
/** Default amount invoiced to the org for the sleeping portion (GBP). */
export const SLEEP_IN_ORG_CHARGE_DEFAULT = 100.0;
/** Default amount paid to the carer for the sleeping portion (GBP). */
export const SLEEP_IN_CARER_PAY_DEFAULT = 50.0;

/**
 * Returns a warning if the sleep-in values are unusual.
 * UI should display this prominently — the org can still proceed.
 *
 * Warn conditions:
 *   - carer_pay > org_charge (platform would lose money)
 *   - org_charge < carer_pay x 1.5 (very thin or negative margin)
 */
export function sleepInNeedsWarning(
  orgCharge: number,
  carerPay: number
): { warn: boolean; message: string | null } {
  if (carerPay > orgCharge) {
    return {
      warn: true,
      message:
        "Carer pay cannot exceed the org charge for the sleep allowance. Please review.",
    };
  }
  if (orgCharge < carerPay * 1.5) {
    return {
      warn: true,
      message:
        "The org charge is less than 1.5x the carer pay. This leaves a very thin platform margin — please confirm this is correct.",
    };
  }
  return { warn: false, message: null };
}

// ── Service users ─────────────────────────────────────────────────────────────
export type ServiceUser = {
  id: string;
  organization_id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  care_categories: CareCategory[];
  care_needs: string | null;
  safety_notes: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ServiceUserAnon = {
  id: string;
  organization_id: string;
  age_band: string;
  postcode_prefix: string;
  care_categories: CareCategory[];
  care_needs: string | null;
  safety_notes: string | null;
};

export type ServiceUserFormValues = {
  full_name: string;
  dob: string;
  gender: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
  care_categories: CareCategory[];
  care_needs: string;
  safety_notes: string;
  primary_contact_name: string;
  primary_contact_phone: string;
};

// ── Org booking status ────────────────────────────────────────────────────────
export type OrgBookingStatus =
  | "pending_offer"
  | "offered"
  | "accepted"
  | "in_progress"
  | "completed"
  | "invoiced"
  | "cancelled";

export const ORG_BOOKING_STATUS_LABEL: Record<OrgBookingStatus, string> = {
  pending_offer: "Pending",
  offered: "Offer sent",
  accepted: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export const ORG_BOOKING_STATUS_COLOR: Record<OrgBookingStatus, string> = {
  pending_offer: "bg-amber-100 text-amber-800",
  offered: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800",
  in_progress: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-100 text-slate-700",
  invoiced: "bg-purple-100 text-purple-800",
  cancelled: "bg-rose-100 text-rose-800",
};

// ── Org booking row ───────────────────────────────────────────────────────────
export type OrgBooking = {
  id: string;
  organization_id: string;
  service_user_id: string | null;
  booker_member_id: string | null;
  booker_name_snapshot: string | null;
  booker_role_snapshot: string | null;
  caregiver_id: string | null;
  preferred_carer_id: string | null;
  status: OrgBookingStatus;
  shift_mode: ShiftMode;

  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  /** Active-hours subtotal: hours x hourly_rate_cents. NOT the org invoice total. */
  subtotal_cents: number;
  platform_fee_cents: number;
  total_cents: number;
  currency: string;

  // sleep_in fields
  active_hours_start: string | null;
  active_hours_end: string | null;
  /**
   * Amount invoiced to the org for the sleeping portion (GBP, not pence).
   * Default £100. Appears as "Sleep-in allowance: £100" on Stripe invoice.
   * NEVER shown to carer; carer only sees sleep_in_carer_pay.
   */
  sleep_in_org_charge: number;
  /**
   * Amount paid to the carer for the sleeping portion (GBP, not pence).
   * Default £50. NEVER shown to the org.
   * Platform retains (sleep_in_org_charge - sleep_in_carer_pay) from sleep portion.
   */
  sleep_in_carer_pay: number;

  // recurring
  parent_booking_id: string | null;
  recurrence_index: number | null;
  is_recurring_parent: boolean;

  required_categories: CareCategory[];
  required_skills: string[];
  booking_source: "seeker" | "org";
  service_type: string;
  notes: string | null;
  location_city: string | null;

  offer_expires_at: string | null;
  offered_at: string | null;
  accepted_at: string | null;
  invoiced_at: string | null;
  stripe_invoice_id: string | null;

  /**
   * Total invoiced to the org (pence). Shown on org dashboard + Stripe invoice.
   * sleep_in: subtotal_cents + ROUND(sleep_in_org_charge x 100)
   * other:    subtotal_cents
   */
  org_charge_total_cents: number | null;

  /**
   * Total owed to the carer (pence). NEVER shown to org.
   * Visible to: carer (earnings screen) + admin (/admin/org-bookings) only.
   * sleep_in: ROUND(subtotal_cents x 0.75) + ROUND(sleep_in_carer_pay x 100)
   * other:    ROUND(subtotal_cents x 0.75)
   */
  carer_pay_total_cents: number | null;

  created_at: string;
  updated_at: string;
};

// ── Booking wizard form values ────────────────────────────────────────────────
export type BookingWizardValues = {
  // Step 1
  service_user_id: string;
  // Step 2
  shift_mode: ShiftMode;
  // Step 3 — dates/times (mode-specific)
  starts_at: string;
  ends_at: string;
  // sleep_in
  active_hours_start: string;
  active_hours_end: string;
  sleep_in_org_charge: number;
  sleep_in_carer_pay: number;
  // recurring_4w
  recurrence_days_of_week: number[]; // 0=Sun ... 6=Sat
  recurrence_start_date: string;
  // Step 4
  required_categories: CareCategory[];
  required_skills: string[];
  // Step 5
  preferred_carer_id: string;
  broadcast: boolean;
  // Step 6 review
  booker_name: string;
  booker_role: string;
  notes: string;
};

// ── Cancellation ──────────────────────────────────────────────────────────────
export type CancellationTimingBucket = "free" | "partial" | "full";

export type CancellationPreview = {
  timing_bucket: CancellationTimingBucket;
  hours_before_start: number;
  /** Amount charged to the org (pence). Shown in fee preview modal. */
  fee_charged_cents: number;
  /** Amount paid to the carer (pence). Internal; not shown to org. */
  carer_payout_cents: number;
  description: string;
};

/**
 * Computes the cancellation fee preview for an org booking.
 *
 * Policy (from spec):
 *   free    >= 24h before start   → no charge, no carer payout
 *   partial >= 2h but < 24h       → 50% of shift fee charged; 100% paid to carer
 *   full    < 2h or no-show       → 100% charged to org; 100% paid to carer
 *
 * shiftTotalCents: org_charge_total_cents (the org invoice amount, not subtotal).
 */
export function computeCancellationPreview(
  startsAt: Date,
  shiftTotalCents: number,
  now: Date = new Date()
): CancellationPreview {
  const msUntilStart = startsAt.getTime() - now.getTime();
  const hoursUntilStart = msUntilStart / (1000 * 60 * 60);

  if (hoursUntilStart >= 24) {
    return {
      timing_bucket: "free",
      hours_before_start: hoursUntilStart,
      fee_charged_cents: 0,
      carer_payout_cents: 0,
      description:
        "Cancelled more than 24 hours before the shift — no charge applies.",
    };
  }

  if (hoursUntilStart >= 2) {
    const fee = Math.round(shiftTotalCents * 0.5);
    return {
      timing_bucket: "partial",
      hours_before_start: hoursUntilStart,
      fee_charged_cents: fee,
      carer_payout_cents: fee, // 100% of fee paid to carer
      description:
        "Cancelled within 24 hours but more than 2 hours before the shift — 50% of the shift fee will be charged to your account and paid in full to the carer.",
    };
  }

  return {
    timing_bucket: "full",
    hours_before_start: Math.max(hoursUntilStart, 0),
    fee_charged_cents: shiftTotalCents,
    carer_payout_cents: shiftTotalCents, // 100% paid to carer
    description:
      "Cancelled within 2 hours of the shift (or no-show) — 100% of the shift fee will be charged to your account and paid in full to the carer.",
  };
}

// ── Org invoice mirror ────────────────────────────────────────────────────────
export type OrgInvoice = {
  id: string;
  organization_id: string;
  booking_id: string | null;
  stripe_invoice_id: string;
  stripe_customer_id: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  due_date: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  created_at: string;
};
