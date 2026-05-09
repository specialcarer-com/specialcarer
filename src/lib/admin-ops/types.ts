/**
 * Shared types for the Admin Ops 3.12 feature pack. Mirrors the
 * Postgres CHECK constraints so the API + UI stay in sync.
 */

// ── Gap 1: re-verification ─────────────────────────────────────────
export const REVERIFY_STATUSES = [
  "none",
  "due",
  "overdue",
  "in_progress",
  "cleared",
] as const;
export type ReverifyStatus = (typeof REVERIFY_STATUSES)[number];

// ── Gap 2: caregiver application pipeline ─────────────────────────
export const CAREGIVER_STAGES = [
  "applied",
  "screening",
  "interview",
  "background_check",
  "training",
  "activated",
  "rejected",
] as const;
export type CaregiverStage = (typeof CAREGIVER_STAGES)[number];

export const CAREGIVER_STAGE_LABEL: Record<CaregiverStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  background_check: "Background check",
  training: "Training",
  activated: "Activated",
  rejected: "Rejected",
};

// ── Gap 3: surge rules + events ────────────────────────────────────
export const SURGE_VERTICALS = [
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
] as const;
export type SurgeVertical = (typeof SURGE_VERTICALS)[number];

export const SURGE_AUTO_FILL_THRESHOLD = 0.6;
export const SURGE_AUTO_DEMAND_RATIO = 1.5;
export const SURGE_AUTO_MULTIPLIER = 1.3;
export const SURGE_MAX_MULTIPLIER = 1.5;

// ── Gap 4: support tickets ─────────────────────────────────────────
export const TICKET_STATUSES = [
  "open",
  "pending",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_CHANNELS = ["web", "email", "app", "phone"] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];

/** SLA milliseconds by priority. open default = 24h. */
export function slaWindowMs(priority: TicketPriority): number {
  switch (priority) {
    case "urgent":
      return 1 * 3600_000;
    case "high":
      return 4 * 3600_000;
    case "normal":
    case "low":
    default:
      return 24 * 3600_000;
  }
}

// ── Gap 5: CMS ─────────────────────────────────────────────────────
export const CMS_POST_STATUSES = ["draft", "published", "archived"] as const;
export type CmsPostStatus = (typeof CMS_POST_STATUSES)[number];

export const CMS_BANNER_PLACEMENTS = [
  "home_top",
  "dashboard_top",
  "app_home",
  "mobile_modal",
] as const;
export type CmsBannerPlacement = (typeof CMS_BANNER_PLACEMENTS)[number];

// ── Gap 6: compliance ─────────────────────────────────────────────
export const COMPLIANCE_DOC_TYPES = [
  "dbs",
  "right_to_work",
  "insurance",
  "first_aid_cert",
  "safeguarding_cert",
  "driver_license",
  "covid_vaccination",
] as const;
export type ComplianceDocType = (typeof COMPLIANCE_DOC_TYPES)[number];

export const COMPLIANCE_DOC_TYPE_LABEL: Record<ComplianceDocType, string> = {
  dbs: "DBS",
  right_to_work: "Right to work",
  insurance: "Insurance",
  first_aid_cert: "First-aid cert",
  safeguarding_cert: "Safeguarding cert",
  driver_license: "Driver licence",
  covid_vaccination: "COVID vaccination",
};

export const COMPLIANCE_STATUSES = [
  "pending",
  "verified",
  "expired",
  "rejected",
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

// ── Gap 7: finance ────────────────────────────────────────────────
export const PAYOUT_STATUSES = [
  "pending",
  "processing",
  "paid",
  "failed",
  "on_hold",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const FRAUD_SIGNAL_TYPES = [
  "velocity",
  "card_mismatch",
  "multi_account",
  "geo_mismatch",
  "chargeback",
  "unusual_pattern",
] as const;
export type FraudSignalType = (typeof FRAUD_SIGNAL_TYPES)[number];

export const FRAUD_SIGNAL_STATUSES = [
  "new",
  "reviewing",
  "cleared",
  "confirmed",
] as const;
export type FraudSignalStatus = (typeof FRAUD_SIGNAL_STATUSES)[number];

export const TAX_DOC_TYPES = [
  "1099",
  "p60",
  "p11d",
  "self_assessment_summary",
] as const;
export type TaxDocType = (typeof TAX_DOC_TYPES)[number];

export const TAX_DOC_STATUSES = [
  "draft",
  "ready",
  "sent",
  "amended",
] as const;
export type TaxDocStatus = (typeof TAX_DOC_STATUSES)[number];

// ── Gap 8: KPIs ───────────────────────────────────────────────────
export const KPI_METRICS = [
  "bookings",
  "gmv",
  "nps",
  "repeat_rate",
  "fill_rate",
  "time_to_match_min",
] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export const KPI_METRIC_LABEL: Record<KpiMetric, string> = {
  bookings: "Bookings",
  gmv: "GMV",
  nps: "NPS",
  repeat_rate: "Repeat rate",
  fill_rate: "Fill rate",
  time_to_match_min: "Time to match (min)",
};

/** Whether higher is better for this metric. Used for delta colouring. */
export function kpiHigherIsBetter(m: KpiMetric): boolean {
  return m !== "time_to_match_min";
}

/** Display formatter (rounded — does not localise; UI may override). */
export function formatKpi(m: KpiMetric, v: number | null | undefined): string {
  if (v == null) return "—";
  switch (m) {
    case "gmv":
      return `£${Math.round(v).toLocaleString("en-GB")}`;
    case "nps":
      return `${Math.round(v)}`;
    case "repeat_rate":
    case "fill_rate":
      return `${(v * 100).toFixed(1)}%`;
    case "time_to_match_min":
      return `${Math.round(v)} min`;
    case "bookings":
    default:
      return Math.round(v).toLocaleString("en-GB");
  }
}
