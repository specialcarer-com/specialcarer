import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Roles a user can hold. Self-service role switching has been removed —
// each account is permanently bound to the role chosen at sign-up. If the
// wrong role was picked, an admin must correct it via
//   POST /api/admin/users/[id]/role
// which writes to admin_audit_log.

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
  const activeBookings =
    (bookingsSeekerRes.count ?? 0) + (bookingsCaregiverRes.count ?? 0);

  // can_switch is permanently false: roles are locked at sign-up.
  // Field is retained for back-compat with older clients.
  return NextResponse.json({
    role,
    can_switch: false,
    active_bookings: activeBookings,
    has_caregiver_profile: !!cgProfileRes.data,
    has_published_caregiver: !!cgProfileRes.data?.is_published,
  });
}

/**
 * POST /api/me/role — DISABLED.
 *
 * Self-service role switching is no longer supported. Each account is
 * permanently bound to the role chosen at sign-up. If a user picked the
 * wrong role, an admin must correct it via the admin panel
 * (POST /api/admin/users/[id]/role). The change is audit-logged.
 *
 * Returns 410 Gone with a stable error code so clients can handle the
 * deprecation gracefully.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "role_switching_disabled",
      message:
        "Account roles are now locked at sign-up. If you need to change your role, please contact support.",
    },
    { status: 410 },
  );
}
