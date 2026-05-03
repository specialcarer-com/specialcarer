import { createAdminClient } from "@/lib/supabase/admin";

export type UserRole = "seeker" | "caregiver" | "admin";

export type AdminUserRow = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  full_name: string | null;
  role: UserRole | null;
  country: string | null;
  phone: string | null;
  // caregiver-only
  is_published?: boolean;
  city?: string | null;
};

export type UsersFilter = {
  role?: UserRole | "all";
  country?: "GB" | "US" | "all";
  q?: string; // email substring
};

const PAGE_SIZE = 50;

export async function listUsersForAdmin(
  filter: UsersFilter,
  page = 1,
): Promise<{ rows: AdminUserRow[]; total: number; totalPages: number }> {
  const admin = createAdminClient();

  // 1. Pull a window of auth.users (paginated server-side by Supabase).
  //    Email substring filtering is applied across the listed page.
  const { data: authPage } = await admin.auth.admin.listUsers({
    page,
    perPage: PAGE_SIZE,
  });
  const allUsers = authPage?.users ?? [];
  // The Supabase admin SDK types are inconsistent: success returns Pagination,
  // failure returns just { users: [] }. Cast to read total/lastPage when present.
  const pagination = authPage as { total?: number; lastPage?: number };
  const total = pagination?.total ?? allUsers.length;
  const totalPages = pagination?.lastPage
    ? pagination.lastPage
    : Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!allUsers.length) return { rows: [], total, totalPages };

  const ids = allUsers.map((u) => u.id);
  const [profilesRes, caregiverRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role, full_name, country, phone")
      .in("id", ids),
    admin
      .from("caregiver_profiles")
      .select("user_id, is_published, city")
      .in("user_id", ids),
  ]);
  const profileById = new Map<
    string,
    { role: UserRole; full_name: string | null; country: string | null; phone: string | null }
  >();
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, {
      role: (p.role as UserRole) ?? "seeker",
      full_name: p.full_name,
      country: p.country,
      phone: p.phone,
    });
  }
  const cgById = new Map<string, { is_published: boolean; city: string | null }>();
  for (const c of caregiverRes.data ?? []) {
    cgById.set(c.user_id, {
      is_published: !!c.is_published,
      city: c.city ?? null,
    });
  }

  let rows: AdminUserRow[] = allUsers.map((u) => {
    const p = profileById.get(u.id);
    const c = cgById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at,
      full_name: p?.full_name ?? null,
      role: p?.role ?? null,
      country: p?.country ?? null,
      phone: p?.phone ?? null,
      is_published: c?.is_published,
      city: c?.city,
    };
  });

  if (filter.role && filter.role !== "all")
    rows = rows.filter((r) => r.role === filter.role);
  if (filter.country && filter.country !== "all")
    rows = rows.filter((r) => r.country === filter.country);
  if (filter.q) {
    const needle = filter.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.email?.toLowerCase().includes(needle) ||
        r.full_name?.toLowerCase().includes(needle),
    );
  }

  return { rows, total, totalPages };
}

export type UserDetail = {
  user: AdminUserRow;
  caregiverProfile: {
    display_name: string | null;
    headline: string | null;
    bio: string | null;
    city: string | null;
    country: string | null;
    is_published: boolean;
    hourly_rate_cents: number | null;
    currency: string | null;
    rating_avg: number | null;
    rating_count: number;
  } | null;
  stripeAccount: {
    stripe_account_id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    requirements_currently_due: string[];
  } | null;
  backgroundChecks: {
    check_type: string;
    status: string;
    issued_at: string | null;
    expires_at: string | null;
  }[];
  bookings: {
    id: string;
    status: string;
    role: "seeker" | "caregiver";
    starts_at: string;
    total_cents: number;
    currency: string;
    counterpartyName: string | null;
  }[];
};

export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const admin = createAdminClient();

  const [authRes, profileRes, cgRes, stripeRes, bgRes, asSeeker, asCaregiver] =
    await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin
        .from("profiles")
        .select("id, role, full_name, country, phone")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("caregiver_profiles")
        .select(
          "display_name, headline, bio, city, country, is_published, hourly_rate_cents, currency, rating_avg, rating_count",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("caregiver_stripe_accounts")
        .select(
          "stripe_account_id, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("background_checks")
        .select("check_type, status, issued_at, expires_at")
        .eq("user_id", userId),
      admin
        .from("bookings")
        .select("id, status, starts_at, total_cents, currency, caregiver_id")
        .eq("seeker_id", userId)
        .order("starts_at", { ascending: false })
        .limit(20),
      admin
        .from("bookings")
        .select("id, status, starts_at, total_cents, currency, seeker_id")
        .eq("caregiver_id", userId)
        .order("starts_at", { ascending: false })
        .limit(20),
    ]);

  if (!authRes.data?.user) return null;

  const u = authRes.data.user;
  const p = profileRes.data;

  // Resolve counterparty names for bookings
  const counterpartyIds = Array.from(
    new Set([
      ...(asSeeker.data ?? []).map((b) => b.caregiver_id),
      ...(asCaregiver.data ?? []).map((b) => b.seeker_id),
    ]),
  );
  const nameById = new Map<string, string | null>();
  if (counterpartyIds.length) {
    const { data: cps } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", counterpartyIds);
    for (const cp of cps ?? []) nameById.set(cp.id, cp.full_name ?? null);
  }

  const bookings: UserDetail["bookings"] = [
    ...(asSeeker.data ?? []).map((b) => ({
      id: b.id,
      status: b.status as string,
      role: "seeker" as const,
      starts_at: b.starts_at as string,
      total_cents: b.total_cents as number,
      currency: b.currency as string,
      counterpartyName: nameById.get(b.caregiver_id) ?? null,
    })),
    ...(asCaregiver.data ?? []).map((b) => ({
      id: b.id,
      status: b.status as string,
      role: "caregiver" as const,
      starts_at: b.starts_at as string,
      total_cents: b.total_cents as number,
      currency: b.currency as string,
      counterpartyName: nameById.get(b.seeker_id) ?? null,
    })),
  ].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
  );

  return {
    user: {
      id: u.id,
      email: u.email ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at,
      full_name: p?.full_name ?? null,
      role: (p?.role as UserRole) ?? null,
      country: p?.country ?? null,
      phone: p?.phone ?? null,
      is_published: cgRes.data?.is_published ?? undefined,
      city: cgRes.data?.city ?? undefined,
    },
    caregiverProfile: cgRes.data
      ? {
          display_name: cgRes.data.display_name,
          headline: cgRes.data.headline,
          bio: cgRes.data.bio,
          city: cgRes.data.city,
          country: cgRes.data.country,
          is_published: !!cgRes.data.is_published,
          hourly_rate_cents: cgRes.data.hourly_rate_cents,
          currency: cgRes.data.currency,
          rating_avg: cgRes.data.rating_avg
            ? Number(cgRes.data.rating_avg)
            : null,
          rating_count: cgRes.data.rating_count ?? 0,
        }
      : null,
    stripeAccount: stripeRes.data
      ? {
          stripe_account_id: stripeRes.data.stripe_account_id,
          charges_enabled: !!stripeRes.data.charges_enabled,
          payouts_enabled: !!stripeRes.data.payouts_enabled,
          details_submitted: !!stripeRes.data.details_submitted,
          requirements_currently_due:
            (stripeRes.data.requirements_currently_due as string[]) ?? [],
        }
      : null,
    backgroundChecks: (bgRes.data ?? []).map((b) => ({
      check_type: b.check_type as string,
      status: b.status as string,
      issued_at: b.issued_at as string | null,
      expires_at: b.expires_at as string | null,
    })),
    bookings,
  };
}
