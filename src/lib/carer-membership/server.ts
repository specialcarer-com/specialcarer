/**
 * Carer Founder Membership — server-side data layer.
 *
 * Server-only. User-scoped reads go through the cookie-bound client (RLS only
 * exposes the caller's own row); the publish-gating check uses the
 * is_active_carer_member SQL function via the service-role client so it can be
 * called consistently regardless of RLS.
 *
 * NEVER import this from a "use client" file.
 */
import "server-only";

import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CarerMembership, CarerMembershipStatus } from "./constants";

/** Read the calling carer's membership row (or null). RLS-scoped. */
export async function getMyCarerMembership(): Promise<CarerMembership | null> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("carer_memberships")
    .select(
      "status, current_period_end, stripe_customer_id, stripe_subscription_id"
    )
    .eq("carer_user_id", user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    status: data.status as CarerMembershipStatus,
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
    stripeCustomerId: (data.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId:
      (data.stripe_subscription_id as string | null) ?? null,
  };
}

/**
 * Whether a carer may publish a NEW public profile. Delegates to the
 * is_active_carer_member(user_id) SQL function so the entitlement rule lives in
 * one place (DB) and can also back RLS later.
 */
export async function isActiveCarerMember(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("is_active_carer_member", {
    user_id: userId,
  });
  if (error) {
    console.error("[carer-membership] is_active_carer_member failed", error.message);
    return false;
  }
  return data === true;
}
