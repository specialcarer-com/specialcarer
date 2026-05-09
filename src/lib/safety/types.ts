/**
 * Shared types for the Support & Safety feature (3.10). Carer-side
 * safety reports and leave-from-job requests, plus the support-page
 * config the app reads on /support pages.
 */

export const SAFETY_REPORT_TYPES = [
  "verbal_abuse",
  "physical_threat",
  "unsafe_environment",
  "inappropriate_request",
  "non_payment",
  "other",
] as const;
export type SafetyReportType = (typeof SAFETY_REPORT_TYPES)[number];

export const SAFETY_SEVERITIES = [
  "low",
  "medium",
  "high",
  "immediate_danger",
] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

export const SAFETY_REPORT_STATUSES = [
  "open",
  "triaging",
  "escalated",
  "resolved",
  "dismissed",
] as const;
export type SafetyReportStatus = (typeof SAFETY_REPORT_STATUSES)[number];

export const SAFETY_REPORT_TYPE_LABEL: Record<SafetyReportType, string> = {
  verbal_abuse: "Verbal abuse",
  physical_threat: "Physical threat",
  unsafe_environment: "Unsafe environment",
  inappropriate_request: "Inappropriate request",
  non_payment: "Non-payment",
  other: "Other",
};

export const SAFETY_SEVERITY_LABEL: Record<SafetySeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  immediate_danger: "Immediate danger",
};

export type SafetyReport = {
  id: string;
  reporter_user_id: string;
  booking_id: string | null;
  subject_user_id: string | null;
  report_type: SafetyReportType;
  severity: SafetySeverity;
  description: string;
  evidence_urls: string[];
  status: SafetyReportStatus;
  admin_notes: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export const LEAVE_REQUEST_REASONS = [
  "feeling_unsafe",
  "medical",
  "family_emergency",
  "client_behaviour",
  "other",
] as const;
export type LeaveRequestReason = (typeof LEAVE_REQUEST_REASONS)[number];

export const LEAVE_REQUEST_REASON_LABEL: Record<LeaveRequestReason, string> = {
  feeling_unsafe: "Feeling unsafe",
  medical: "Medical",
  family_emergency: "Family emergency",
  client_behaviour: "Client behaviour",
  other: "Other",
};

export const LEAVE_REQUEST_STATUSES = [
  "open",
  "approved",
  "denied",
  "withdrawn",
] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export type LeaveRequest = {
  id: string;
  carer_user_id: string;
  booking_id: string;
  reason: LeaveRequestReason;
  description: string;
  replacement_needed: boolean;
  status: LeaveRequestStatus;
  admin_notes: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type SupportConfig = {
  hotline_phone_uk: string;
  hotline_phone_us: string;
  hotline_hours: string;
  support_email: string;
  chat_enabled: boolean;
  chat_url: string | null;
  insurance_summary_md: string;
  worker_protection_md: string;
};

/** Booking statuses where a "leave request" makes sense. */
export const ACTIVE_BOOKING_STATUSES = ["paid", "in_progress"] as const;
