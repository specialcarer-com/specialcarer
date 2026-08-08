import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TRISTATE_YES_NO,
  type YesNoUnsure,
} from "@/lib/vetting/types";
import {
  isReferenceType,
  validateEmploymentDates,
} from "@/lib/vetting/reference-cqc";

export const dynamic = "force-dynamic";

type Body = {
  token?: string;
  rating?: number;
  recommend?: boolean;
  comment?: string;
  reference_type?: string;
  employment_start?: string | null;
  employment_end?: string | null;
  still_employed?: boolean;
  position_held?: string | null;
  weekly_hours?: number | null;
  reason_for_leaving?: string | null;
  absence_days_12m?: number | null;
  sponsors_visa?: string | null;
  warnings_undisposed?: string | null;
  under_investigation?: string | null;
  safeguarding_dbs?: string | null;
  would_reemploy?: string | null;
  values_example?: string | null;
  referee_position?: string | null;
  referee_company?: string | null;
  referee_company_addr?: string | null;
  referee_signed_date?: string | null;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asOptionalText(
  value: unknown,
  maxLength: number,
  field: string,
): { value: string | null; error?: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }
  if (typeof value !== "string") return { value: null, error: `${field} is invalid` };
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { value: null, error: `${field} must be ${maxLength} characters or fewer` };
  }
  return { value: trimmed || null };
}

function asDate(
  value: unknown,
  field: string,
): { value: string | null; error?: string } {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    return { value: null, error: `${field} must be a valid date` };
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { value: null, error: `${field} must be a valid date` };
  }
  return { value };
}

function invalid(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/**
 * POST /api/references/submit
 *
 * Public endpoint (no auth) — the referee follows the email link to
 * /r/[token]/page.tsx and submits the form. Token verifies the row.
 * Status flips invited → submitted; admin then flips to verified
 * later from the trust-safety dashboard.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const rating =
    Number.isInteger(body.rating) &&
    (body.rating as number) >= 1 &&
    (body.rating as number) <= 5
      ? (body.rating as number)
      : null;
  const recommend =
    typeof body.recommend === "boolean" ? body.recommend : null;
  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, 2000)
      : null;
  const referenceType = String(body.reference_type ?? "").trim();
  if (!isReferenceType(referenceType)) {
    return invalid("Reference type is required");
  }
  const employmentStart = asDate(body.employment_start, "Employment start date");
  const employmentEnd = asDate(body.employment_end, "Employment end date");
  const refereeSignedDate = asDate(body.referee_signed_date, "Today's date");
  const positionHeld = asOptionalText(body.position_held, 120, "Position held");
  const reasonForLeaving = asOptionalText(
    body.reason_for_leaving,
    500,
    "Reason for leaving",
  );
  const sponsorsVisa = asOptionalText(body.sponsors_visa, 200, "Visa sponsorship");
  const valuesExample = asOptionalText(body.values_example, 2000, "Values example");
  const refereePosition = asOptionalText(
    body.referee_position,
    120,
    "Your position",
  );
  const refereeCompany = asOptionalText(
    body.referee_company,
    160,
    "Company name",
  );
  const refereeCompanyAddr = asOptionalText(
    body.referee_company_addr,
    500,
    "Company address",
  );
  const textFields = [
    employmentStart,
    employmentEnd,
    refereeSignedDate,
    positionHeld,
    reasonForLeaving,
    sponsorsVisa,
    valuesExample,
    refereePosition,
    refereeCompany,
    refereeCompanyAddr,
  ];
  const textError = textFields.find((field) => field.error)?.error;
  if (textError) return invalid(textError);

  const stillEmployed =
    typeof body.still_employed === "boolean" ? body.still_employed : false;
  const weeklyHours =
    typeof body.weekly_hours === "number" &&
    Number.isFinite(body.weekly_hours) &&
    body.weekly_hours >= 0 &&
    body.weekly_hours <= 168
      ? body.weekly_hours
      : null;
  const absenceDays =
    Number.isInteger(body.absence_days_12m) &&
    (body.absence_days_12m as number) >= 0 &&
    (body.absence_days_12m as number) <= 366
      ? (body.absence_days_12m as number)
      : null;
  const tristate = (value: unknown): YesNoUnsure | null => {
    if (!TRISTATE_YES_NO.includes(value as YesNoUnsure)) {
      return null;
    }
    return value as YesNoUnsure;
  };
  const warningsUndisposed = tristate(body.warnings_undisposed);
  const underInvestigation = tristate(body.under_investigation);
  const safeguardingDbs = tristate(body.safeguarding_dbs);
  const wouldReemploy = tristate(body.would_reemploy);

  if (
    !warningsUndisposed ||
    !underInvestigation ||
    !safeguardingDbs ||
    !wouldReemploy
  ) {
    return invalid("All conduct and safeguarding questions must be answered");
  }
  if (!valuesExample.value) return invalid("Values example is required");
  if (!refereePosition.value) return invalid("Your position is required");
  if (!refereeCompany.value) return invalid("Company name is required");
  if (!refereeCompanyAddr.value) return invalid("Company address is required");
  if (!refereeSignedDate.value) return invalid("Today's date is required");
  const hasEmploymentFields = referenceType !== "character";
  if (hasEmploymentFields && weeklyHours === null) {
    return invalid("Weekly hours must be between 0 and 168");
  }
  if (hasEmploymentFields && absenceDays === null) {
    return invalid("Absence days must be between 0 and 366");
  }

  const needsEmploymentDetails =
    referenceType === "employer" || referenceType === "professional";
  if (needsEmploymentDetails && !employmentStart.value) {
    return invalid("Employment start date is required");
  }
  if (needsEmploymentDetails && !positionHeld.value) {
    return invalid("Position held is required");
  }
  if (referenceType === "employer" && !stillEmployed && !reasonForLeaving.value) {
    return invalid("Reason for leaving is required");
  }
  const dateError = validateEmploymentDates({
    employmentStart: employmentStart.value,
    employmentEnd: employmentEnd.value,
    stillEmployed,
    today: new Date().toISOString().slice(0, 10),
  });
  if (dateError) return invalid(dateError);

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("carer_references")
    .select("id, status, token_expires_at")
    .eq("token", token)
    .maybeSingle<{
      id: string;
      status: string;
      token_expires_at: string;
    }>();

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (row.status !== "invited") {
    return NextResponse.json({ error: "already_submitted" }, { status: 400 });
  }
  if (new Date(row.token_expires_at).getTime() < Date.now()) {
    await admin
      .from("carer_references")
      .update({ status: "expired" })
      .eq("id", row.id);
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 240) ?? null;

  const { error } = await admin
    .from("carer_references")
    .update({
      status: "submitted",
      rating,
      recommend,
      comment,
      reference_type: referenceType,
      employment_start: employmentStart.value,
      employment_end: employmentEnd.value,
      still_employed: stillEmployed,
      position_held: positionHeld.value,
      weekly_hours: weeklyHours,
      reason_for_leaving: reasonForLeaving.value,
      absence_days_12m: absenceDays,
      sponsors_visa: sponsorsVisa.value,
      warnings_undisposed: warningsUndisposed,
      under_investigation: underInvestigation,
      safeguarding_dbs: safeguardingDbs,
      would_reemploy: wouldReemploy,
      values_example: valuesExample.value,
      referee_position: refereePosition.value,
      referee_company: refereeCompany.value,
      referee_company_addr: refereeCompanyAddr.value,
      referee_signed_date: refereeSignedDate.value,
      ip_address: ip,
      user_agent: ua,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
