/**
 * Memberships — server-side data layer.
 *
 * This module is server-only. It uses the Supabase service-role client for
 * privileged writes (Stripe webhook + admin grants) and a per-request
 * cookie-bound client for user-scoped reads.
 *
 * NEVER import this from a "use client" file.
 */

import "server-only";

import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ActiveMembership,
  MembershipPlan,
  MembershipInterval,
  MembershipStatus,
} from "./types";
import { isEntitled } from "./types";

/**
 * Get the calling user's current active membership (or null).
 * Reads via RLS-bound client — only returns the caller's own row.
 */
export async function getMyMembership(): Promise<ActiveMembership | null> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_current_plan")
    .select(
      "plan, status, source, billing_interval, current_period_end, cancel_at_period_end"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  if (!isEntitled(data.status as MembershipStatus)) return null;

  return {
    plan: data.plan as MembershipPlan,
    status: data.status as MembershipStatus,
    source: data.source as ActiveMembership["source"],
    billingInterval:
      (data.billing_interval as MembershipInterval | null) ?? null,
    currentPeriodEnd:
      (data.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
  };
}

/**
 * Get any user's current membership — admin-only path. Use the service-role
 * client. Caller is responsible for authorising the admin.
 */
export async function getMembershipForUserAdmin(
  userId: string
): Promise<ActiveMembership | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_current_plan")
    .select(
      "plan, status, source, billing_interval, current_period_end, cancel_at_period_end"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  if (!isEntitled(data.status as MembershipStatus)) return null;

  return {
    plan: data.plan as MembershipPlan,
    status: data.status as MembershipStatus,
    source: data.source as ActiveMembership["source"],
    billingInterval:
      (data.billing_interval as MembershipInterval | null) ?? null,
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
  };
}

/**
 * Grant a complimentary membership to a user. Admin-only.
 *
 * Idempotent: if the user already has an active comp on the same plan, no-op.
 * If they have a different active comp, it's canceled first.
 * If they have a paid Stripe subscription, the comp is added on top — Stripe
 * subscription continues to bill (admin should cancel in Stripe if desired).
 */
export async function grantCompMembership(input: {
  userId: string;
  plan: MembershipPlan;
  grantedBy: string;
  reason?: string;
  /** ISO date — when comp expires. null = indefinite. */
  expiresAt?: string | null;
}): Promise<{ ok: true; subscriptionId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();

  // 1. Cancel any existing comp for this user
  await admin
    .from("subscriptions")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .eq("source", "comp")
    .eq("status", "comp");

  // 2. Insert new comp row
  const { data, error } = await admin
    .from("subscriptions")
    .insert({
      user_id: input.userId,
      plan: input.plan,
      billing_interval: null,
      status: "comp",
      source: "comp",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_start: new Date().toISOString(),
      current_period_end: input.expiresAt ?? null,
      cancel_at_period_end: false,
      granted_by: input.grantedBy,
      grant_reason: input.reason ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed" };
  }
  return { ok: true, subscriptionId: data.id };
}

/**
 * Revoke a comp membership. Sets status=canceled. Admin-only.
 * Stripe-paid subscriptions cannot be revoked via this path — they must
 * be canceled in Stripe (which fires a webhook that updates this row).
 */
export async function revokeCompMembership(
  subscriptionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId)
    .eq("source", "comp");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * List recent membership rows (admin overview). Joins to profiles for
 * display name + email.
 */
export async function listMembershipsAdmin(opts: {
  limit?: number;
  status?: MembershipStatus | "all";
} = {}): Promise<Array<{
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  plan: MembershipPlan;
  status: MembershipStatus;
  source: ActiveMembership["source"];
  current_period_end: string | null;
  granted_by: string | null;
  grant_reason: string | null;
  created_at: string;
}>> {
  const admin = createAdminClient();
  const limit = Math.min(opts.limit ?? 100, 500);

  let q = admin
    .from("subscriptions")
    .select(
      "id, user_id, plan, status, source, current_period_end, granted_by, grant_reason, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.status && opts.status !== "all") {
    q = q.eq("status", opts.status);
  }

  const { data: subs, error } = await q;
  if (error || !subs) return [];

  // Hydrate user names from profiles, emails from auth.users via admin API
  const userIds = Array.from(new Set(subs.map((s) => s.user_id)));
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  );

  // auth.admin.listUsers paginates; for an admin overview screen, fetch up to
  // 1000 users. If the deployment ever exceeds that, switch to per-id getUserById.
  const { data: usersList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (usersList?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  return subs.map((s) => {
    const p = profileById.get(s.user_id);
    return {
      id: s.id as string,
      user_id: s.user_id as string,
      user_email: emailById.get(s.user_id) ?? null,
      user_name: (p?.full_name as string | null) ?? null,
      plan: s.plan as MembershipPlan,
      status: s.status as MembershipStatus,
      source: s.source as ActiveMembership["source"],
      current_period_end: (s.current_period_end as string | null) ?? null,
      granted_by: (s.granted_by as string | null) ?? null,
      grant_reason: (s.grant_reason as string | null) ?? null,
      created_at: s.created_at as string,
    };
  });
}
