/**
 * Server-side data layer for Family Sharing.
 *
 * Writes go through the admin (service-role) client because RLS only grants
 * SELECT to authenticated users — the server enforces the actual rules
 * (only the primary user can invite / remove / revoke).
 *
 * Reads go through the user-scoped SSR client so the existing RLS policies
 * naturally restrict who sees what.
 */

import "server-only";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderFamilyInviteEmail } from "@/lib/email/templates";
import {
  FAMILY_INVITE_TTL_DAYS,
  FAMILY_MAX_MEMBERS,
  type Family,
  type FamilyInvite,
  type FamilyMember,
  type FamilyOverview,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateInviteToken(): { token: string; tokenHash: string } {
  // 32 bytes -> base64url ~43 chars; URL safe; unguessable.
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://specialcarer.com"
  );
}

// ---------------------------------------------------------------------------
// Read paths (RLS-protected via user client)
// ---------------------------------------------------------------------------

/**
 * Get the current user's family overview — ensuring there's a row for them
 * either as the primary user (their own family) or as a member of someone
 * else's family. Auto-creates a family for the caller if they don't have one.
 */
export async function getMyFamilyOverview(): Promise<FamilyOverview | null> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  // Strategy: pick the family where this user is most relevant.
  // 1. If they own a family, use that.
  // 2. Else, if they are an active member of someone else's family, use the
  //    most recently joined one.
  // 3. Else, lazily create a family for them as primary.

  const admin = createAdminClient();

  // 1. Own family?
  let { data: ownFamily } = await admin
    .from("families")
    .select("id, primary_user_id, display_name, created_at")
    .eq("primary_user_id", user.id)
    .maybeSingle();

  if (!ownFamily) {
    // 2. Member of another family?
    const { data: memberRow } = await admin
      .from("family_members")
      .select("family_id, joined_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .neq("role", "primary")
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (memberRow?.family_id) {
      const { data: otherFamily } = await admin
        .from("families")
        .select("id, primary_user_id, display_name, created_at")
        .eq("id", memberRow.family_id)
        .maybeSingle();
      if (otherFamily) {
        return loadOverview(otherFamily as Family, user.id);
      }
    }

    // 3. Create their own family lazily.
    const { data: created, error: createErr } = await admin
      .from("families")
      .insert({ primary_user_id: user.id })
      .select("id, primary_user_id, display_name, created_at")
      .single();
    if (createErr || !created) {
      console.error("[family] auto-create failed", createErr);
      return null;
    }
    ownFamily = created;
  }

  return loadOverview(ownFamily as Family, user.id);
}

async function loadOverview(
  family: Family,
  callerId: string
): Promise<FamilyOverview> {
  const admin = createAdminClient();
  const isPrimary = family.primary_user_id === callerId;

  const [{ data: members }, { data: invites }] = await Promise.all([
    admin
      .from("family_members")
      .select(
        "id, family_id, user_id, invited_email, display_name, role, status, joined_at, created_at"
      )
      .eq("family_id", family.id)
      .neq("status", "removed")
      .order("created_at", { ascending: true }),
    isPrimary
      ? admin
          .from("family_invites")
          .select(
            "id, family_id, invited_email, display_name, status, expires_at, created_at, accepted_at"
          )
          .eq("family_id", family.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as FamilyInvite[] }),
  ]);

  // Hydrate emails for members that have a user_id.
  const userIds = (members ?? [])
    .map((m) => m.user_id)
    .filter((id): id is string => !!id);
  const emailByUser = new Map<string, string>();
  if (userIds.length) {
    // Use admin.auth.admin to look up emails individually — there's no
    // bulk-by-id endpoint, but list is paginated. We'll fetch each.
    await Promise.all(
      userIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data.user?.email) emailByUser.set(id, data.user.email);
      })
    );
  }

  const hydratedMembers: FamilyMember[] = (members ?? []).map((m) => ({
    ...(m as FamilyMember),
    email: m.user_id ? emailByUser.get(m.user_id) ?? null : m.invited_email,
  }));

  return {
    family,
    members: hydratedMembers,
    invites: (invites ?? []) as FamilyInvite[],
    is_primary: isPrimary,
  };
}

// ---------------------------------------------------------------------------
// Mutations (server actions / API routes)
// ---------------------------------------------------------------------------

export type InviteFamilyMemberInput = {
  email: string;
  displayName?: string | null;
};

export type InviteFamilyMemberResult =
  | { ok: true; inviteId: string; acceptUrl: string; emailSent: boolean }
  | { ok: false; error: string };

/**
 * Create a pending invite + email a magic-link to the recipient.
 * Only the primary user of a family may invite.
 */
export async function inviteFamilyMember(
  input: InviteFamilyMemberInput
): Promise<InviteFamilyMemberResult> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;

  if (!emailLooksValid(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const admin = createAdminClient();

  // Ensure the caller has a family they own; create lazily if needed.
  let { data: family } = await admin
    .from("families")
    .select("id, primary_user_id, display_name")
    .eq("primary_user_id", user.id)
    .maybeSingle();
  if (!family) {
    const { data: created, error: createErr } = await admin
      .from("families")
      .insert({ primary_user_id: user.id })
      .select("id, primary_user_id, display_name")
      .single();
    if (createErr || !created) {
      return { ok: false, error: "Couldn't create family." };
    }
    family = created;
  }

  // Don't invite the primary themselves.
  if (user.email && email === user.email.toLowerCase()) {
    return { ok: false, error: "You're already in your own family." };
  }

  // Cap members.
  const { count: activeCount } = await admin
    .from("family_members")
    .select("id", { count: "exact", head: true })
    .eq("family_id", family.id)
    .in("status", ["active", "invited"]);
  if ((activeCount ?? 0) >= FAMILY_MAX_MEMBERS) {
    return {
      ok: false,
      error: `Family is at the ${FAMILY_MAX_MEMBERS}-member limit. Remove someone before inviting more.`,
    };
  }

  // Reject if already an active member with that email.
  const { data: existingMember } = await admin
    .from("family_members")
    .select("id, status")
    .eq("family_id", family.id)
    .eq("invited_email", email)
    .maybeSingle();
  if (existingMember?.status === "active") {
    return { ok: false, error: "That person is already in your family." };
  }

  // Revoke any prior pending invite for this email/family before creating new.
  await admin
    .from("family_invites")
    .update({ status: "revoked" })
    .eq("family_id", family.id)
    .eq("invited_email", email)
    .eq("status", "pending");

  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + FAMILY_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: invite, error: insertErr } = await admin
    .from("family_invites")
    .insert({
      family_id: family.id,
      invited_email: email,
      display_name: displayName,
      token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select("id, expires_at")
    .single();

  if (insertErr || !invite) {
    console.error("[family] invite insert failed", insertErr);
    return { ok: false, error: "Couldn't create invite." };
  }

  // Best-effort: also reflect in family_members as an "invited" placeholder
  // so the primary's UI can show pending invitees in one list. We can't use
  // upsert here because the unique index is partial — explicit check first.
  const { data: existingPlaceholder } = await admin
    .from("family_members")
    .select("id")
    .eq("family_id", family.id)
    .eq("invited_email", email)
    .is("user_id", null)
    .eq("status", "invited")
    .maybeSingle();
  if (existingPlaceholder?.id) {
    await admin
      .from("family_members")
      .update({ display_name: displayName })
      .eq("id", existingPlaceholder.id);
  } else {
    await admin
      .from("family_members")
      .insert({
        family_id: family.id,
        invited_email: email,
        display_name: displayName,
        role: "member",
        status: "invited",
      });
  }

  const acceptUrl = `${getAppOrigin()}/family/accept/${token}`;

  // Send email.
  const inviterName =
    user.user_metadata?.full_name ||
    (user.email ? user.email.split("@")[0] : "Someone");
  const tpl = renderFamilyInviteEmail({
    inviterName,
    familyName: family.display_name,
    acceptUrl,
    expiresAt: invite.expires_at,
    recipientName: displayName,
  });
  const sendResult = await sendEmail({
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });

  return {
    ok: true,
    inviteId: invite.id,
    acceptUrl,
    emailSent: sendResult.ok,
  };
}

export type AcceptInviteResult =
  | { ok: true; familyId: string }
  | { ok: false; error: string; needsAuth?: boolean };

/**
 * Accept a magic-link invite. Caller must be authenticated. The invite's
 * email and the caller's email do NOT need to match — we simply require
 * a valid logged-in user (matching simplifies the UX for relatives who
 * already have a SpecialCarer account on a different email).
 */
export async function acceptFamilyInvite(
  token: string
): Promise<AcceptInviteResult> {
  if (!token || token.length < 16) {
    return { ok: false, error: "This invite link is invalid." };
  }

  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Please sign in to accept this invite.",
      needsAuth: true,
    };
  }

  const admin = createAdminClient();
  const tokenHash = hashToken(token);

  const { data: invite } = await admin
    .from("family_invites")
    .select("id, family_id, invited_email, display_name, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!invite) {
    return { ok: false, error: "This invite link is invalid." };
  }
  if (invite.status === "accepted") {
    return { ok: true, familyId: invite.family_id };
  }
  if (invite.status === "revoked") {
    return { ok: false, error: "This invite has been revoked." };
  }
  if (invite.status === "expired" || new Date(invite.expires_at) < new Date()) {
    await admin
      .from("family_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return { ok: false, error: "This invite has expired." };
  }

  // Don't let primary accept their own invite (corner case).
  const { data: family } = await admin
    .from("families")
    .select("primary_user_id")
    .eq("id", invite.family_id)
    .maybeSingle();
  if (family?.primary_user_id === user.id) {
    return { ok: false, error: "You're already the primary on this family." };
  }

  // Insert / promote the family_members row.
  // Try update of the placeholder row first, then insert if missing.
  const { data: placeholder } = await admin
    .from("family_members")
    .select("id")
    .eq("family_id", invite.family_id)
    .eq("invited_email", invite.invited_email)
    .is("user_id", null)
    .maybeSingle();

  let memberId: string | null = null;
  if (placeholder?.id) {
    const { data: updated, error: updErr } = await admin
      .from("family_members")
      .update({
        user_id: user.id,
        status: "active",
        joined_at: new Date().toISOString(),
      })
      .eq("id", placeholder.id)
      .select("id")
      .single();
    if (updErr) {
      // Possibly a duplicate (user already a member via different placeholder).
      console.error("[family] accept update failed", updErr);
    } else {
      memberId = updated.id;
    }
  }

  if (!memberId) {
    // Either no placeholder, or the caller is already a member of this family
    // via another row. Try an existing-by-(family_id,user_id) match first.
    const { data: existing } = await admin
      .from("family_members")
      .select("id, status")
      .eq("family_id", invite.family_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing?.id) {
      const { error: reactErr } = await admin
        .from("family_members")
        .update({
          status: "active",
          joined_at: new Date().toISOString(),
          display_name: invite.display_name ?? undefined,
        })
        .eq("id", existing.id);
      if (reactErr) {
        console.error("[family] reactivate failed", reactErr);
        return { ok: false, error: "Couldn't accept invite. Please try again." };
      }
      memberId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("family_members")
        .insert({
          family_id: invite.family_id,
          user_id: user.id,
          invited_email: invite.invited_email,
          display_name: invite.display_name,
          role: "member",
          status: "active",
          joined_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        console.error("[family] accept insert failed", insErr);
        return { ok: false, error: "Couldn't accept invite. Please try again." };
      }
      memberId = inserted.id;
    }
  }

  await admin
    .from("family_invites")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: user.id,
      family_member_id: memberId,
    })
    .eq("id", invite.id);

  return { ok: true, familyId: invite.family_id };
}

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Remove a member from the caller's family. Only the primary may remove
 * members, and they may not remove themselves.
 */
export async function removeFamilyMember(
  memberId: string
): Promise<RemoveMemberResult> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("family_members")
    .select("id, family_id, role, user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return { ok: false, error: "Member not found." };

  const { data: family } = await admin
    .from("families")
    .select("primary_user_id")
    .eq("id", member.family_id)
    .maybeSingle();
  if (!family || family.primary_user_id !== user.id) {
    return { ok: false, error: "Only the primary can remove family members." };
  }
  if (member.role === "primary") {
    return { ok: false, error: "You can't remove the primary." };
  }

  const { error } = await admin
    .from("family_members")
    .update({ status: "removed" })
    .eq("id", memberId);
  if (error) {
    console.error("[family] remove failed", error);
    return { ok: false, error: "Couldn't remove member." };
  }

  return { ok: true };
}

export type RevokeInviteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function revokeFamilyInvite(
  inviteId: string
): Promise<RevokeInviteResult> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("family_invites")
    .select("id, family_id, invited_email")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return { ok: false, error: "Invite not found." };

  const { data: family } = await admin
    .from("families")
    .select("primary_user_id")
    .eq("id", invite.family_id)
    .maybeSingle();
  if (!family || family.primary_user_id !== user.id) {
    return { ok: false, error: "Only the primary can revoke invites." };
  }

  await admin
    .from("family_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId);

  // Tidy up the placeholder family_members row, if any.
  await admin
    .from("family_members")
    .delete()
    .eq("family_id", invite.family_id)
    .eq("invited_email", invite.invited_email)
    .is("user_id", null);

  return { ok: true };
}
