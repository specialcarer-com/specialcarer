import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SAFETY_REPORT_TYPES,
  SAFETY_SEVERITIES,
  type SafetyReportType,
  type SafetySeverity,
} from "@/lib/safety/types";

export const dynamic = "force-dynamic";

const MAX_EVIDENCE_URLS = 5;

/**
 * POST /api/safety/report
 * Body:
 *   {
 *     bookingId?: string,
 *     subjectUserId?: string,
 *     reportType: SafetyReportType,
 *     severity: SafetySeverity,
 *     description: string (10-5000 chars),
 *     evidenceUrls?: string[] (max 5)
 *   }
 *
 * On insert, the safety_reports_auto_sos_trg trigger raises an
 * sos_alerts row when severity = 'immediate_danger'.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const reportType = p.reportType;
  const severity = p.severity;
  const description = typeof p.description === "string" ? p.description : "";
  const bookingId =
    typeof p.bookingId === "string" && p.bookingId ? p.bookingId : null;
  const subjectUserId =
    typeof p.subjectUserId === "string" && p.subjectUserId
      ? p.subjectUserId
      : null;
  const evidenceUrlsRaw = Array.isArray(p.evidenceUrls) ? p.evidenceUrls : [];

  if (
    typeof reportType !== "string" ||
    !(SAFETY_REPORT_TYPES as readonly string[]).includes(reportType)
  ) {
    return NextResponse.json({ error: "invalid_report_type" }, { status: 400 });
  }
  if (
    typeof severity !== "string" ||
    !(SAFETY_SEVERITIES as readonly string[]).includes(severity)
  ) {
    return NextResponse.json({ error: "invalid_severity" }, { status: 400 });
  }
  const trimmed = description.trim();
  if (trimmed.length < 10 || trimmed.length > 5000) {
    return NextResponse.json(
      { error: "description_length", message: "Description must be 10–5000 characters." },
      { status: 400 },
    );
  }
  const evidenceUrls = evidenceUrlsRaw
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .slice(0, MAX_EVIDENCE_URLS);

  const { data, error } = await supabase
    .from("safety_reports")
    .insert({
      reporter_user_id: user.id,
      booking_id: bookingId,
      subject_user_id: subjectUserId,
      report_type: reportType as SafetyReportType,
      severity: severity as SafetySeverity,
      description: trimmed,
      evidence_urls: evidenceUrls,
    })
    .select("id, severity, status, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ report: data });
}
