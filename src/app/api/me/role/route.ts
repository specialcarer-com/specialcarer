import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SELF_SWITCHABLE_ROLES = ["seeker", "caregiver"] as const;
type SelfSwitchableRole = (typeof SELF_SWITCHABLE_ROLES)[number];

/**
 * GET /api/me/role
 *
 * Returns the signed-in user's current role plus a flags object the UI
 * uses to warn the user about side-effects of switching:
 *
 *   {
 *     role: "seeker" | "caregiver" | "admin",
 *     can_switch: boolean,            // false for admins
 *     active_bookings: number,        // bookings in pending/confirmed/in_progress
 *     has_published_caregiver: boolean,
 *     has_caregiver_profile: boolean,
 *   }
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  const [profileRes, bookingsSeekerRes, bookingsCaregiverRes, cgProfileRes] =
    await Promise.all([
      admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("seeker_id", user.id)
        .in("status", ["pending", "confirmed", "in_progress", "paid"]),
      admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("caregiver_id", user.id)
        .in("status", ["pending", "confirmed", "in_progress", "paid"]),
      admin
        .from("caregiver_profiles")
        .select("is_published")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const role = profileRes.data?.role ?? "seeker";
  const canSwitch = role === "seeker" || role === "caregiver";
  const activeBookings =
    (bookingsSeekerRes.count ?? 0) + (bookingsCaregiverRes.count ?? 0);

  return NextResponse.json({
    role,
    can_switch: canSwitch,
    active_bookings: activeBookings,
    has_caregiver_profile: !!cgProfileRes.data,
    has_published_caregiver: !!cgProfileRes.data?.is_published,
  });
}

/**
 * POST /api/me/role
 * Body: { role: "seeker" | "caregiver" }
 *
 * Self-serve role switch for the signed-in user. Admins cannot use this
 * endpoint to demote themselves — they must use the admin panel.
 *
 * Side-effects:
 * - When switching seeker → caregiver, the user must still complete
 *   /m/onboarding (or the caregiver profile setup) before they appear
 *   in search. The unpublished caregiver_profile row is left intact so
 *   no carer data is destroyed by toggling back and forth.
 * - When switching caregiver → seeker, any caregiver_profiles row is
 *   set is_published=false so the carer disappears from search. The
 *   row itself is preserved so the user can switch back without losing
 *   their bio, certifications, etc.
 *
 * The action is audit-logged in admin_audit_log with admin_id = the
 * acting user (since they are acting on themselves).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    role?: string;
  };
  const newRole = body.role as SelfSwitchableRole | undefined;

  if (
    !newRole ||
    !SELF_SWITCHABLE_ROLES.includes(newRole as SelfSwitchableRole)
  ) {
    return NextResponse.json(
      {
        error: `role must be one of ${SELF_SWITCHABLE_ROLES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const priorRole = existing?.role ?? null;

  if (priorRole === "admin") {
    return NextResponse.json(
      {
        error:
          "Admins cannot switch their own role here — please ask another admin via the admin panel.",
      },
      { status: 400 },
    );
  }

  if (priorRole === newRole) {
    return NextResponse.json({ ok: true, status: "noop", role: newRole });
  }

  // Update profile.
  const { error: profErr } = await admin
    .from("profiles")
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (profErr) {
    return NextResponse.json(
      { error: `Update failed: ${profErr.message}` },
      { status: 500 },
    );
  }

  // Mirror to auth.user_metadata so the JWT/user-meta stays in sync.
  // Best-effort: ignore failures (the profiles row is the source of truth).
  try {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata ?? {}),
        role: newRole,
      },
    });
  } catch {
    // ignore
  }

  // Side-effect: if switching away from caregiver, hide their carer
  // profile from search (preserve the row).
  if (priorRole === "caregiver" && newRole !== "caregiver") {
    await admin
      .from("caregiver_profiles")
      .update({ is_published: false })
      .eq("user_id", user.id);
  }

  // Audit log (best-effort; never blocks the response).
  try {
    await admin.from("admin_audit_log").insert({
      admin_id: user.id,
      action: "user.self_switch_role",
      target_type: "user",
      target_id: user.id,
      details: { prior_role: priorRole, new_role: newRole },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({
    ok: true,
    role: newRole,
    prior_role: priorRole,
    next_steps:
      newRole === "caregiver"
        ? "Complete your carer onboarding to appear in search."
        : null,
  });
}
