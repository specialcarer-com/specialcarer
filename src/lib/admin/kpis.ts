import { createAdminClient } from "@/lib/supabase/admin";

export type Kpis = {
  signupsLast24h: number;
  signupsLast7d: number;
  bookingsToday: number;
  bookingsLast7d: number;
  gmvLast7dByCurrency: { gbp: number; usd: number }; // in cents
  feeLast7dByCurrency: { gbp: number; usd: number }; // in cents
  gmvMtdByCurrency: { gbp: number; usd: number }; // in cents
  completionRate30d: number; // 0..1, completed/(completed+cancelled+refunded) over 30d
  payoutsEligibleNow: number;
  payoutsHeld: number;
  openDisputes: number;
  publishedCaregivers: number;
  caregiversAwaitingReview: number; // not published but onboarded
};

function startOfTodayUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfMonthUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function isoMinus(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export async function getKpis(): Promise<Kpis> {
  const admin = createAdminClient();
  const since24h = isoMinus(24);
  const since7d = isoMinus(24 * 7);
  const since30d = isoMinus(24 * 30);
  const todayStart = startOfTodayUtc().toISOString();
  const monthStart = startOfMonthUtc().toISOString();
  const nowIso = new Date().toISOString();

  // Run in parallel — every count uses head:true for efficiency.
  const [
    signups24,
    signups7d,
    bookingsToday,
    bookings7d,
    bookingRows7d,
    bookingRowsMtd,
    bookingRows30d,
    payoutsEligible,
    payoutsHeld,
    openDisputes,
    pubCare,
    awaitingCare,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7d),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7d),
    admin
      .from("bookings")
      .select("total_cents, subtotal_cents, platform_fee_cents, currency, status")
      .gte("created_at", since7d),
    admin
      .from("bookings")
      .select("total_cents, subtotal_cents, platform_fee_cents, currency, status")
      .gte("created_at", monthStart),
    admin
      .from("bookings")
      .select("status")
      .gte("created_at", since30d),
    // Payouts eligible NOW = completed + payout_eligible_at <= now + not yet paid_out
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .lte("payout_eligible_at", nowIso),
    // Held = completed but not yet eligible (still in 24h window)
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gt("payout_eligible_at", nowIso),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "disputed"),
    admin
      .from("caregiver_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("is_published", true),
    admin
      .from("caregiver_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("is_published", false),
  ]);

  function sumByCurrency(
    rows: { total_cents?: number | null; subtotal_cents: number; platform_fee_cents: number; currency: string; status?: string }[],
    field: "total_cents" | "subtotal_cents" | "platform_fee_cents",
    excludeStatuses: string[] = ["cancelled", "refunded"],
  ) {
    const out = { gbp: 0, usd: 0 };
    for (const r of rows ?? []) {
      if (r.status && excludeStatuses.includes(r.status)) continue;
      const c = (r.currency ?? "").toLowerCase();
      if (c === "gbp") out.gbp += r[field] ?? 0;
      else if (c === "usd") out.usd += r[field] ?? 0;
    }
    return out;
  }

  const rows7d = bookingRows7d.data ?? [];
  const rowsMtd = bookingRowsMtd.data ?? [];
  const rows30d = bookingRows30d.data ?? [];

  // GMV = client-paid (total_cents) under split-fee model. This is the
  // gross transaction value, including the 10% client uplift.
  const gmvLast7d = sumByCurrency(rows7d, "total_cents");
  const feeLast7d = sumByCurrency(rows7d, "platform_fee_cents");
  const gmvMtd = sumByCurrency(rowsMtd, "total_cents");

  let completed = 0;
  let terminal = 0;
  for (const r of rows30d) {
    if (r.status === "completed" || r.status === "paid_out") {
      completed += 1;
      terminal += 1;
    } else if (r.status === "cancelled" || r.status === "refunded") {
      terminal += 1;
    }
  }
  const completionRate30d = terminal === 0 ? 0 : completed / terminal;

  return {
    signupsLast24h: signups24.count ?? 0,
    signupsLast7d: signups7d.count ?? 0,
    bookingsToday: bookingsToday.count ?? 0,
    bookingsLast7d: bookings7d.count ?? 0,
    gmvLast7dByCurrency: gmvLast7d,
    feeLast7dByCurrency: feeLast7d,
    gmvMtdByCurrency: gmvMtd,
    completionRate30d,
    payoutsEligibleNow: payoutsEligible.count ?? 0,
    payoutsHeld: payoutsHeld.count ?? 0,
    openDisputes: openDisputes.count ?? 0,
    publishedCaregivers: pubCare.count ?? 0,
    caregiversAwaitingReview: awaitingCare.count ?? 0,
  };
}

export function fmtCents(cents: number, currency: "gbp" | "usd") {
  const symbol = currency === "gbp" ? "£" : "$";
  return `${symbol}${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
