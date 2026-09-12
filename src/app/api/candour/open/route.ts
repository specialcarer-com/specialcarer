/**
 * POST /api/candour/open — carer-facing endpoint to file a fresh
 * notifiable event (Phase C — PR C3a).
 *
 * See src/lib/candour/case.ts for the state machine and audit-trail
 * contract, and supabase/migrations/20260912170000_notifiable_events.sql
 * for the schema shape + RLS matrix.
 *
 * Request body (JSON):
 *   {
 *     type: 'death'|'injury_serious'|'abuse_alleged'|'deprivation_of_liberty'
 *          |'incident_police_involved'|'service_stopped'|'other',
 *     severity: 'low'|'medium'|'high'|'critical',
 *     discovered_at?: ISO string (defaults to now),
 *     occurred_at?: ISO string,
 *     booking_id?: uuid,
 *     carer_id?: uuid,
 *     subject_person_id?: uuid,
 *     subject_description?: string,   // required if subject_person_id omitted
 *     notes?: string
 *   }
 *
 * Responses:
 *   201 { ok:true, event_id }             — event created
 *   202 { ok:true, skippedReason }        — schema not yet applied
 *                                           (safe during deploy window)
 *   400 { ok:false, error }               — validation
 *   401 { ok:false, error }               — not authenticated
 *   429 { ok:false, error:'rate_limited' } — 5/hr per user ceiling hit
 *   500 { ok:false, error }               — unexpected
 *
 * Rate limit: 5 per hour per user, keyed via the C2 shared limiter
 * (`@/lib/rate-limit/distributed` + `candourOpenUser` key builder).
 *
 * Notifications: on success, an in-app notification is dispatched to
 * every admin (proxy for RM queue until the RM role is added — see
 * migration header comment). Notification failure is swallowed and
 * logged; it must not fail the case creation, or the carer will re-file
 * and the audit trail will show duplicates.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { check as rlCheck } from "@/lib/rate-limit/distributed";
import { rateLimitHeaders } from "@/lib/rate-limit/headers";
import { candourOpenUser } from "@/lib/rate-limit/keys";
import { openCase, type NotifiableType, type Severity } from "@/lib/candour/case";

export const dynamic = "force-dynamic";

/** 5 case-open events per hour per user. Deliberately generous — a
 *  single carer legitimately filing more than a handful in one hour
 *  probably needs admin intervention anyway. */
const USER_LIMIT = 5;
const HOUR_SEC = 60 * 60;

const NOTIFIABLE_TYPES: readonly NotifiableType[] = [
  "death",
  "injury_serious",
  "abuse_alleged",
  "deprivation_of_liberty",
  "incident_police_involved",
  "service_stopped",
  "other",
];
const SEVERITIES: readonly Severity[] = ["low", "medium", "high", "critical"];

function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function jsonError(
  error: string,
  status: number,
  extra?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: extra },
  );
}

export async function POST(req: NextRequest) {
  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("unauthenticated", 401);
  }

  // ── Rate limit ──
  const rl = await rlCheck({
    key: candourOpenUser(user.id),
    limit: USER_LIMIT,
    windowSec: HOUR_SEC,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // ── Body validation ──
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const body = (raw ?? {}) as Record<string, unknown>;

  const type = body.type;
  if (typeof type !== "string" || !NOTIFIABLE_TYPES.includes(type as NotifiableType)) {
    return jsonError("invalid_type", 400);
  }
  const severity = body.severity;
  if (typeof severity !== "string" || !SEVERITIES.includes(severity as Severity)) {
    return jsonError("invalid_severity", 400);
  }
  const discovered_at = parseIsoDate(body.discovered_at) ?? new Date();
  const occurred_at =
    body.occurred_at === undefined || body.occurred_at === null
      ? null
      : parseIsoDate(body.occurred_at);
  if (body.occurred_at !== undefined && body.occurred_at !== null && !occurred_at) {
    return jsonError("invalid_occurred_at", 400);
  }
  const subject_person_id =
    typeof body.subject_person_id === "string" && body.subject_person_id.trim()
      ? body.subject_person_id.trim()
      : null;
  const subject_description =
    typeof body.subject_description === "string" && body.subject_description.trim()
      ? body.subject_description.trim()
      : null;
  if (!subject_person_id && !subject_description) {
    return jsonError("subject_required", 400);
  }
  const booking_id =
    typeof body.booking_id === "string" && body.booking_id.trim()
      ? body.booking_id.trim()
      : null;
  const carer_id =
    typeof body.carer_id === "string" && body.carer_id.trim()
      ? body.carer_id.trim()
      : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  // ── Open case ──
  const admin = createAdminClient();
  const result = await openCase(
    {
      type: type as NotifiableType,
      severity: severity as Severity,
      reported_by: user.id,
      discovered_at,
      occurred_at: occurred_at ?? null,
      subject_person_id,
      subject_description,
      booking_id,
      carer_id,
      notes,
    },
    { db: admin },
  );

  if (!result.ok) {
    // openCase surfaces its own semantic errors; treat as 400.
    return jsonError(result.error, 400);
  }
  if ("skippedReason" in result) {
    return NextResponse.json(
      { ok: true, skippedReason: result.skippedReason },
      { status: 202 },
    );
  }

  // ── Fire-and-forget admin notification ──
  // Failure must not fail the case creation. Wrap in try/catch.
  fanoutToAdmins(admin, {
    event_id: result.event_id,
    type: type as NotifiableType,
    severity: severity as Severity,
    reporterId: user.id,
  }).catch((e) => {
    console.error("[candour.open] admin notification fan-out failed", e);
  });

  return NextResponse.json(
    { ok: true, event_id: result.event_id },
    { status: 201, headers: rateLimitHeaders(rl) },
  );
}

/**
 * Fan out an in-app notification to every admin. Today "admin" acts as
 * the RM queue proxy — see the migration header comment for the RM/NI
 * roles roadmap. When those roles land, extend the role filter here
 * (grep for `fanoutToAdmins`).
 */
async function fanoutToAdmins(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from(table: string): any },
  args: {
    event_id: string;
    type: NotifiableType;
    severity: Severity;
    reporterId: string;
  },
): Promise<void> {
  const { data: rows, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  if (error || !Array.isArray(rows) || rows.length === 0) {
    return;
  }
  // Lazy-import so tests that never call the route don't pull the
  // notifications module transitively.
  const { createNotification } = await import("@/lib/notifications/server");
  for (const row of rows) {
    const uid = (row as { id?: string }).id;
    if (!uid) continue;
    try {
      await createNotification({
        user_id: uid,
        type: "candour.opened",
        title: `New notifiable event: ${args.type} (${args.severity})`,
        body: "A carer has filed a new duty-of-candour / notifiable event. Open the admin queue to triage.",
        deeplink: `/admin/safeguarding/candour/${args.event_id}`,
        payload: {
          event_id: args.event_id,
          notifiable_type: args.type,
          severity: args.severity,
          reporter_id: args.reporterId,
        },
      });
    } catch (e) {
      console.error("[candour.open] notification insert failed for admin", uid, e);
    }
  }
}
