import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * Shared admin gate. Returns the admin user or a NextResponse error.
 */
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
 * PATCH /api/admin/users/[id]
 * Body: { email?: string, full_name?: string, phone?: string, country?: string, reason: string }
 *
 * Admin-only. Edits a user's profile and (optionally) auth email.
 * - Email change is applied to auth.users via the admin client.
 *   email_confirm:true keeps the account verified.
 * - full_name / phone / country are written to public.profiles.
 * - All edits require a reason and are recorded in the audit log.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetId } = await params;

  const gate = await gateAdmin();
  if (!gate.ok) return gate.res;
  const { admin: actor } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    full_name?: string;
    phone?: string;
    country?: string;
    reason?: string;
  };

  const reason = (body.reason ?? "").trim();
  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required for user edits." },
      { status: 400 },
    );
  }

  const newEmail = body.email?.trim().toLowerCase();
  const newName =
    body.full_name !== undefined ? body.full_name.trim() : undefined;
  const newPhone =
    body.phone !== undefined ? body.phone.trim() : undefined;
  const newCountry =
    body.country !== undefined ? body.country.trim() : undefined;

  if (
    newEmail === undefined &&
    newName === undefined &&
    newPhone === undefined &&
    newCountry === undefined
  ) {
    return NextResponse.json(
      { error: "Nothing to update. Provide at least one field." },
      { status: 400 },
    );
  }

  if (newEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json(
      { error: "Email looks invalid." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  // Load current state for audit + to detect no-op.
  const { data: existingAuth } =
    await adminClient.auth.admin.getUserById(targetId);
  if (!existingAuth?.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id, full_name, phone, country, role")
    .eq("id", targetId)
    .maybeSingle();

  const priorEmail = existingAuth.user.email ?? null;
  const priorName = existingProfile?.full_name ?? null;
  const priorPhone = existingProfile?.phone ?? null;
  const priorCountry = existingProfile?.country ?? null;

  const changes: Record<string, { from: unknown; to: unknown }> = {};

  // Apply auth.users changes
  if (newEmail !== undefined && newEmail !== priorEmail) {
    const { error: emailErr } = await adminClient.auth.admin.updateUserById(
      targetId,
      {
        email: newEmail,
        email_confirm: true,
      },
    );
    if (emailErr) {
      return NextResponse.json(
        { error: `Auth update failed: ${emailErr.message}` },
        { status: 500 },
      );
    }
    changes.email = { from: priorEmail, to: newEmail };
  }

  // Apply profile changes
  const profilePatch: Record<string, string | null> = {};
  if (newName !== undefined && newName !== (priorName ?? "")) {
    profilePatch.full_name = newName === "" ? null : newName;
    changes.full_name = { from: priorName, to: profilePatch.full_name };
  }
  if (newPhone !== undefined && newPhone !== (priorPhone ?? "")) {
    profilePatch.phone = newPhone === "" ? null : newPhone;
    changes.phone = { from: priorPhone, to: profilePatch.phone };
  }
  if (newCountry !== undefined && newCountry !== (priorCountry ?? "")) {
    profilePatch.country = newCountry === "" ? null : newCountry;
    changes.country = { from: priorCountry, to: profilePatch.country };
  }
  if (Object.keys(profilePatch).length > 0) {
    const { error: profErr } = await adminClient
      .from("profiles")
      .update({ ...profilePatch, updated_at: new Date().toISOString() })
      .eq("id", targetId);
    if (profErr) {
      return NextResponse.json(
        { error: `Profile update failed: ${profErr.message}` },
        { status: 500 },
      );
    }
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ ok: true, status: "noop" });
  }

  await logAdminAction({
    admin: actor,
    action: "user.edit",
    targetType: "user",
    targetId,
    details: { changes, reason },
  });

  return NextResponse.json({ ok: true, changes });
}

/**
 * DELETE /api/admin/users/[id]?reason=...
 *
 * Admin-only. Permanently removes the auth user. Related rows in public
 * schema cascade via FK ON DELETE CASCADE / set null. Self-deletion is
 * rejected to prevent accidental lockout.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetId } = await params;
  const gate = await gateAdmin();
  if (!gate.ok) return gate.res;
  const { admin: actor } = gate;

  const url = new URL(req.url);
  const reason = (url.searchParams.get("reason") ?? "").trim();
  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required for user deletion." },
      { status: 400 },
    );
  }

  if (targetId === actor.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account from the admin panel." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  const { data: existingAuth } =
    await adminClient.auth.admin.getUserById(targetId);
  if (!existingAuth?.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const priorEmail = existingAuth.user.email ?? null;

  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("full_name, role")
    .eq("id", targetId)
    .maybeSingle();

  const { error: delErr } =
    await adminClient.auth.admin.deleteUser(targetId);
  if (delErr) {
    return NextResponse.json(
      { error: `Delete failed: ${delErr.message}` },
      { status: 500 },
    );
  }

  await logAdminAction({
    admin: actor,
    action: "user.delete",
    targetType: "user",
    targetId,
    details: {
      prior_email: priorEmail,
      prior_name: existingProfile?.full_name ?? null,
      prior_role: existingProfile?.role ?? null,
      reason,
    },
  });

  return NextResponse.json({ ok: true });
}
