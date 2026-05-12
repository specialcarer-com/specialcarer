/**
 * POST /api/admin/compliance/grace-period-blast
 *
 * One-shot compliance email blast for carers currently in their 30-day
 * grace period. Sends each carer a personalised email listing the
 * mandatory courses they're missing and their grace-period deadline.
 *
 * Idempotent: tracks `compliance_blast_sent_at` on the profile so each
 * carer only ever receives one of these. Pass `?dry_run=true` to
 * preview the audience and the first-recipient email without sending.
 *
 * Auth: admin only.
 */

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendGracePeriodBlast,
  _renderGracePeriodBlastHtml,
} from "@/lib/email/grace-period-blast";

type CourseSlug =
  | "manual-handling"
  | "infection-control"
  | "food-hygiene"
  | "medication-administration"
  | "safeguarding-adults"
  | "safeguarding-children";

function parseQuery(url: URL): { dry_run: boolean; limit: number } {
  const dr = url.searchParams.get("dry_run");
  const lim = url.searchParams.get("limit");
  const dry_run = dr === "true" || dr === "1";
  let limit = 100;
  if (lim) {
    const n = Number.parseInt(lim, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 500) limit = n;
  }
  return { dry_run, limit };
}

interface CarerRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  works_with_adults: boolean | null;
  works_with_children: boolean | null;
  agency_optin_grace_period_until: string;
  food_hygiene_passed: boolean | null;
  medication_administration_passed: boolean | null;
  safeguarding_adults_passed: boolean | null;
  safeguarding_children_passed: boolean | null;
  manual_handling_passed: boolean | null;
  infection_control_passed: boolean | null;
}

function missingCoursesFor(row: CarerRow): CourseSlug[] {
  const out: CourseSlug[] = [];
  if (!row.manual_handling_passed) out.push("manual-handling");
  if (!row.infection_control_passed) out.push("infection-control");
  if (!row.food_hygiene_passed) out.push("food-hygiene");
  if (!row.medication_administration_passed)
    out.push("medication-administration");
  if (row.works_with_adults && !row.safeguarding_adults_passed) {
    out.push("safeguarding-adults");
  }
  if (row.works_with_children && !row.safeguarding_children_passed) {
    out.push("safeguarding-children");
  }
  return out;
}

export async function POST(req: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const { dry_run, limit } = parseQuery(url);

  const sb = createAdminClient();

  // Pull every active carer in a live grace window who hasn't already
  // received the blast.
  const { data: candidates, error } = await sb
    .from("v_agency_opt_in_gates")
    .select(
      "user_id, works_with_adults, works_with_children, agency_optin_grace_period_until, manual_handling_passed, infection_control_passed, food_hygiene_passed, medication_administration_passed, safeguarding_adults_passed, safeguarding_children_passed",
    )
    .eq("in_grace_period", true)
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: `Query failed: ${error.message}` },
      { status: 500 },
    );
  }

  const ids = (candidates ?? []).map((c) => c.user_id);
  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      audience: 0,
      sent: 0,
      skipped: 0,
      message: "No carers currently in grace period",
    });
  }

  const { data: profiles } = await sb
    .from("profiles")
    .select("id, full_name, email, compliance_blast_sent_at")
    .in("id", ids);
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );

  const audience: CarerRow[] = (candidates ?? []).map((c) => ({
    ...(c as Omit<CarerRow, "full_name" | "email">),
    full_name: profileById.get(c.user_id)?.full_name ?? null,
    email: profileById.get(c.user_id)?.email ?? null,
  }));

  let sent = 0;
  const skipped: Array<{ user_id: string; reason: string }> = [];
  const errors: Array<{ user_id: string; error: string }> = [];
  const previews: Array<{
    user_id: string;
    email: string;
    full_name: string;
    missing: string[];
    grace_ends_at: string;
  }> = [];

  for (const row of audience) {
    const profile = profileById.get(row.user_id);
    if (!profile?.email) {
      skipped.push({ user_id: row.user_id, reason: "no email on profile" });
      continue;
    }
    if (profile.compliance_blast_sent_at) {
      skipped.push({
        user_id: row.user_id,
        reason: "already sent at " + profile.compliance_blast_sent_at,
      });
      continue;
    }
    const missing = missingCoursesFor(row);
    if (missing.length === 0) {
      skipped.push({
        user_id: row.user_id,
        reason: "already passed all required courses",
      });
      continue;
    }

    const payload = {
      fullName: profile.full_name ?? "Carer",
      email: profile.email,
      missingCourses: missing,
      graceEndsAt: row.agency_optin_grace_period_until,
      worksWithAdults: row.works_with_adults ?? true,
      worksWithChildren: row.works_with_children ?? false,
    };

    previews.push({
      user_id: row.user_id,
      email: payload.email,
      full_name: payload.fullName,
      missing,
      grace_ends_at: payload.graceEndsAt,
    });

    if (dry_run) continue;

    const result = await sendGracePeriodBlast(payload);
    if (!result.ok) {
      errors.push({ user_id: row.user_id, error: result.error ?? "unknown" });
      continue;
    }
    // Stamp profile so we never resend.
    await sb
      .from("profiles")
      .update({ compliance_blast_sent_at: new Date().toISOString() })
      .eq("id", row.user_id);
    sent += 1;
  }

  // For dry-runs, also return the HTML for the first recipient so the
  // admin can paste it into their browser to inspect.
  const samplePreviewHtml =
    dry_run && previews[0]
      ? _renderGracePeriodBlastHtml({
          fullName: previews[0].full_name,
          email: previews[0].email,
          missingCourses: previews[0].missing as CourseSlug[],
          graceEndsAt: previews[0].grace_ends_at,
          worksWithAdults:
            audience.find((a) => a.user_id === previews[0].user_id)
              ?.works_with_adults ?? true,
          worksWithChildren:
            audience.find((a) => a.user_id === previews[0].user_id)
              ?.works_with_children ?? false,
        })
      : undefined;

  return NextResponse.json({
    ok: errors.length === 0,
    dry_run,
    audience: audience.length,
    sent,
    skipped: skipped.length,
    errors: errors.length,
    previews,
    skipped_detail: skipped,
    errors_detail: errors,
    ...(samplePreviewHtml ? { sample_preview_html: samplePreviewHtml } : {}),
  });
}
