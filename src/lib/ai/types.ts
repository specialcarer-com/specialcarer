/**
 * Shared types for AI / Smart Features v1. Mirrors the Postgres CHECK
 * constraints and JSONB shapes from
 * supabase/migrations/20260509_ai_smart_features_v1.sql so the API,
 * library code, and UI all agree on names.
 */

export const AI_MODEL_VERSION = "v1.0";

// ── Verticals (canonical 5) ───────────────────────────────────────
export const SERVICE_TYPES = [
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

// ── Matching ──────────────────────────────────────────────────────
export type MatchFeatures = {
  completion_rate: number; // 0..1
  on_time_rate: number; // 0..1
  avg_rating: number; // 0..5
  review_count: number;
  tenure_days: number;
  no_show_count_90d: number;
  service_mix: Partial<Record<string, number>>; // counts per service_type
  pref_postcodes?: string[];
};

export type MatchBreakdown = {
  rating: number;
  completion: number;
  on_time: number;
  service_mix: number;
  tenure: number;
  location: number;
};

export type MatchScore = {
  caregiver_id: string;
  seeker_id?: string;
  service_type: string;
  score: number; // 0..1
  breakdown: MatchBreakdown;
  reasons: string[];
};

// ── Schedule predictions ──────────────────────────────────────────
export const SCHEDULE_SUGGESTION_STATUSES = [
  "pending",
  "accepted",
  "dismissed",
  "expired",
] as const;
export type ScheduleSuggestionStatus =
  (typeof SCHEDULE_SUGGESTION_STATUSES)[number];

export type ScheduleSuggestion = {
  id: string;
  seeker_id: string;
  weekday: number; // 0..6
  hour: number; // 0..23
  service_type: string;
  caregiver_id: string | null;
  occurrences: number;
  confidence: number; // 0..1
  suggestion_status: ScheduleSuggestionStatus;
  acted_at: string | null;
  computed_at: string;
};

// ── Care summaries ────────────────────────────────────────────────
export const CARE_SUMMARY_SCOPES = ["booking", "weekly", "monthly"] as const;
export type CareSummaryScope = (typeof CARE_SUMMARY_SCOPES)[number];

export const MOOD_TRENDS = [
  "positive",
  "neutral",
  "mixed",
  "concern",
] as const;
export type MoodTrend = (typeof MOOD_TRENDS)[number];

export type CareSummary = {
  id: string;
  scope: CareSummaryScope;
  booking_id: string | null;
  recipient_id: string | null;
  family_id: string | null;
  period_start: string | null;
  period_end: string | null;
  headline: string;
  bullets: string[];
  mood_trend: MoodTrend;
  flags: string[];
  source_entry_ids: string[];
  computed_at: string;
};

// ── Anomalies ─────────────────────────────────────────────────────
export const ANOMALY_KINDS = [
  "no_show",
  "late_check_in",
  "route_deviation",
  "early_check_out",
  "location_gap",
  "rating_drop",
] as const;
export type AnomalyKind = (typeof ANOMALY_KINDS)[number];

export const ANOMALY_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];

export const ANOMALY_STATUSES = [
  "open",
  "triaged",
  "dismissed",
  "resolved",
] as const;
export type AnomalyStatus = (typeof ANOMALY_STATUSES)[number];

export type AnomalySignal = {
  id: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  booking_id: string | null;
  caregiver_id: string | null;
  seeker_id: string | null;
  magnitude: number | null;
  details: Record<string, unknown>;
  status: AnomalyStatus;
  triaged_by: string | null;
  triaged_at: string | null;
  resolution_notes: string | null;
  detected_at: string;
};

// ── Chat ──────────────────────────────────────────────────────────
export const CHAT_SURFACES = ["web", "mobile", "help-center"] as const;
export type ChatSurface = (typeof CHAT_SURFACES)[number];

export const CHAT_OUTCOMES = [
  "open",
  "bot_resolved",
  "escalated",
  "abandoned",
] as const;
export type ChatOutcome = (typeof CHAT_OUTCOMES)[number];

export const CHAT_ROLES = ["user", "bot", "agent", "system"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export type ChatSession = {
  id: string;
  user_id: string | null;
  anon_session_id: string | null;
  surface: ChatSurface;
  outcome: ChatOutcome;
  ticket_id: string | null;
  intent: string | null;
  last_intent_confidence: number | null;
  created_at: string;
  ended_at: string | null;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: ChatRole;
  body: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type ChatIntentId =
  | "booking_status"
  | "change_or_cancel"
  | "payment_issue"
  | "refund_request"
  | "missing_caregiver"
  | "safety_concern"
  | "how_to_use"
  | "become_a_caregiver"
  | "talk_to_human"
  | "unknown";

export type ChatIntent = {
  id: ChatIntentId;
  label: string;
  keywords: string[];
  suggestedReply: string;
  escalate: boolean;
};

// ── UI labels ────────────────────────────────────────────────────
export const SERVICE_TYPE_LABEL: Record<string, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
};

export const WEEKDAY_LABEL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
