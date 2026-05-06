import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["seeker", "caregiver", "admin"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

async function gateAdmin(): Promise<
  { ok: true; admin: AdminUser } | { ok: false; res: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return {
      ok: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, admin: { id: user.id, email: user.email ?? null } };
}

/**
 * POST /api/admin/users
 * Body:
 *   {
 *     email: string,
 *     role: "seeker" | "caregiver" | "admin",
 *     full_name?: string,
 *     country?: "GB" | "US",
 *     phone?: string,
 *     send_invite?: boolean,   // default true — emails a magic link to set password
 *     reason: string
 *   }
 *
 * Admin-only. Creates a new auth user, marks the email confirmed, and
 * upserts a profile row with the chosen role. If send_invite is true,
 * Supabase emails the user an invitation/password-set link.
 */
export async function POST(req: Request) {
  const gate = await gateAdmin();
  if (!gate.ok) return gate.res;
  const { admin: actor } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    role?: string;
    full_name?: string;
    country?: string;
    phone?: string;
    send_invite?: boolean;
    reason?: string;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role as AllowedRole | undefined;
  const fullName = body.full_name?.trim() || null;
  const country = body.country?.trim() || null;
  const phone = body.phone?.trim() || null;
  const reason = (body.reason ?? "").trim();
  const sendInvite = body.send_invite !== false;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Valid email is required." },
      { status: 400 },
    );
  }
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of ${ALLOWED_ROLES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  let newUserId: string;

  if (sendInvite) {
    // inviteUserByEmail emails a magic-link the user clicks to set a password.
    // The invited user is created confirmed.
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { role, full_name: fullName },
      },
    );
    if (error || !data?.user) {
      return NextResponse.json(
        { error: `Invite failed: ${error?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    newUserId = data.user.id;
  } else {
    // No invite email — admin must communicate credentials out of band.
    const tempPassword =
      "Temp_" +
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 6).toUpperCase() +
      "!";
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: tempPassword,
      user_metadata: { role, full_name: fullName },
    });
    if (error || !data?.user) {
      return NextResponse.json(
        { error: `Create failed: ${error?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    newUserId = data.user.id;
  }

  // Upsert the profile row. The DB trigger may have already created a default
  // profile from auth.users; we update it with the admin-chosen values.
  const { error: profErr } = await adminClient
    .from("profiles")
    .upsert(
      {
        id: newUserId,
        role,
        full_name: fullName,
        country,
        phone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (profErr) {
    return NextResponse.json(
      {
        error: `Auth user created but profile update failed: ${profErr.message}`,
        user_id: newUserId,
      },
      { status: 500 },
    );
  }

  await logAdminAction({
    admin: actor,
    action: "user.create",
    targetType: "user",
    targetId: newUserId,
    details: {
      email,
      role,
      full_name: fullName,
      country,
      phone,
      send_invite: sendInvite,
      reason,
    },
  });

  return NextResponse.json({ ok: true, user_id: newUserId });
}
