import { createAdminClient } from "@/lib/supabase/admin";

const UK_REQUIRED = ["enhanced_dbs_barred", "right_to_work", "digital_id"];
const US_REQUIRED = ["us_criminal", "us_healthcare_sanctions"];

export type CaregiverRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  city: string | null;
  country: "GB" | "US" | null;
  is_published: boolean;
  hourly_rate_cents: number | null;
  currency: "GBP" | "USD" | null;
  created_at: string;
  updated_at: string | null;

  // readiness
  payouts_enabled: boolean;
  charges_enabled: boolean;
  bg_required: string[];
  bg_cleared: string[];
  bg_missing: string[];

  rating_avg: number | null;
  rating_count: number;
};

export type ListFilter = "awaiting_review" | "published" | "all";

export async function listCaregiversForAdmin(
  filter: ListFilter,
): Promise<CaregiverRow[]> {
  const admin = createAdminClient();

  let q = admin
    .from("caregiver_profiles")
    .select(
      "user_id, display_name, city, country, is_published, hourly_rate_cents, currency, created_at, updated_at, rating_avg, rating_count",
    )
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "awaiting_review") q = q.eq("is_published", false);
  if (filter === "published") q = q.eq("is_published", true);
  const { data: profiles } = await q;
  if (!profiles?.length) return [];

  const ids = profiles.map((p) => p.user_id);

  const [emailRes, stripeRes, bgRes] = await Promise.all([
    // Email lookup via auth.admin (not exposed via PostgREST)
    Promise.all(ids.map((id) => admin.auth.admin.getUserById(id))),
    admin
      .from("caregiver_stripe_accounts")
      .select("user_id, charges_enabled, payouts_enabled")
      .in("user_id", ids),
    admin
      .from("background_checks")
      .select("user_id, check_type, status")
      .in("user_id", ids),
  ]);

  const emailById = new Map<string, string | null>();
  emailRes.forEach((res, i) => {
    emailById.set(ids[i], res.data?.user?.email ?? null);
  });

  const stripeById = new Map<
    string,
    { charges_enabled: boolean; payouts_enabled: boolean }
  >();
  for (const s of stripeRes.data ?? []) {
    stripeById.set(s.user_id, {
      charges_enabled: !!s.charges_enabled,
      payouts_enabled: !!s.payouts_enabled,
    });
  }

  const bgById = new Map<string, Set<string>>();
  for (const b of bgRes.data ?? []) {
    if (b.status !== "cleared") continue;
    if (!bgById.has(b.user_id)) bgById.set(b.user_id, new Set());
    bgById.get(b.user_id)!.add(b.check_type as string);
  }

  return profiles.map((p) => {
    const required = p.country === "US" ? US_REQUIRED : UK_REQUIRED;
    const cleared = bgById.get(p.user_id) ?? new Set<string>();
    const missing = required.filter((r) => !cleared.has(r));
    const stripe = stripeById.get(p.user_id);
    return {
      user_id: p.user_id,
      display_name: p.display_name,
      email: emailById.get(p.user_id) ?? null,
      city: p.city,
      country: (p.country as "GB" | "US" | null) ?? null,
      is_published: !!p.is_published,
      hourly_rate_cents: p.hourly_rate_cents,
      currency: (p.currency as "GBP" | "USD" | null) ?? null,
      created_at: p.created_at as string,
      updated_at: (p.updated_at as string | null) ?? null,
      payouts_enabled: stripe?.payouts_enabled ?? false,
      charges_enabled: stripe?.charges_enabled ?? false,
      bg_required: required,
      bg_cleared: Array.from(cleared),
      bg_missing: missing,
      rating_avg: p.rating_avg ? Number(p.rating_avg) : null,
      rating_count: (p.rating_count as number) ?? 0,
    } satisfies CaregiverRow;
  });
}

export function readinessLabel(c: CaregiverRow): {
  ready: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (!c.payouts_enabled) blockers.push("Stripe payouts not enabled");
  if (c.bg_missing.length > 0)
    blockers.push(`Missing checks: ${c.bg_missing.join(", ")}`);
  return { ready: blockers.length === 0, blockers };
}
