import { createAdminClient } from "@/lib/supabase/admin";

// ISO date (YYYY-MM-DD) for the Monday of the week containing date
function isoWeekMonday(d: Date): string {
  const day = d.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export type SignupCohort = {
  week: string; // YYYY-MM-DD (Monday)
  signups: number;
  seekers: number;
  caregivers: number;
};

export type FunnelStep = {
  label: string;
  count: number;
  pct_of_top: number;
};

export type RetentionCohort = {
  cohort_week: string;
  cohort_size: number;
  w1_retained: number; // returning in week 1..4
  w2_retained: number;
  w3_retained: number;
  w4_retained: number;
};

export async function getSignupCohorts(weeks = 12): Promise<SignupCohort[]> {
  const admin = createAdminClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - weeks * 7);
  since.setUTCHours(0, 0, 0, 0);

  // Auth users (paginated through admin API)
  const allUsers: { id: string; created_at: string }[] = [];
  let page = 1;
  const perPage = 1000;
  // listUsers is paginated; cap at 10 pages to be safe.
  for (let i = 0; i < 10; i++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data?.users) break;
    for (const u of data.users) {
      if (u.created_at && new Date(u.created_at) >= since) {
        allUsers.push({ id: u.id, created_at: u.created_at });
      }
    }
    if (data.users.length < perPage) break;
    page += 1;
  }

  if (allUsers.length === 0) return [];

  // Roles via profiles
  const ids = allUsers.map((u) => u.id);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, role")
    .in("id", ids);
  const roleById = new Map<string, string>();
  for (const p of profiles ?? [])
    roleById.set(p.id, (p.role as string) ?? "seeker");

  const buckets = new Map<string, SignupCohort>();
  for (const u of allUsers) {
    const wk = isoWeekMonday(new Date(u.created_at));
    let b = buckets.get(wk);
    if (!b) {
      b = { week: wk, signups: 0, seekers: 0, caregivers: 0 };
      buckets.set(wk, b);
    }
    b.signups += 1;
    const role = roleById.get(u.id) ?? "seeker";
    if (role === "caregiver") b.caregivers += 1;
    else b.seekers += 1;
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.week < b.week ? 1 : -1,
  );
}

export async function getFunnel(): Promise<FunnelStep[]> {
  const admin = createAdminClient();

  // Step 1: signups (all auth users)
  let signups = 0;
  let page = 1;
  const perPage = 1000;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data?.users) break;
    signups += data.users.length;
    if (data.users.length < perPage) break;
    page += 1;
  }

  // Step 2: profile completed = profiles with full_name not null
  const { count: profilesCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("full_name", "is", null);

  // Step 3: first booking created (distinct seekers)
  const { data: bookers } = await admin
    .from("bookings")
    .select("seeker_id")
    .limit(20000);
  const distinctBookers = new Set((bookers ?? []).map((b) => b.seeker_id));

  // Step 4: completed booking (distinct seekers with status in completed/paid_out)
  const { data: completed } = await admin
    .from("bookings")
    .select("seeker_id")
    .in("status", ["completed", "paid_out"])
    .limit(20000);
  const distinctCompleted = new Set(
    (completed ?? []).map((b) => b.seeker_id),
  );

  const top = signups || 1;
  const steps = [
    { label: "Signed up", count: signups },
    { label: "Profile completed", count: profilesCount ?? 0 },
    { label: "First booking created", count: distinctBookers.size },
    { label: "Completed booking", count: distinctCompleted.size },
  ];
  return steps.map((s) => ({ ...s, pct_of_top: s.count / top }));
}

export async function getRetention(weeks = 4): Promise<RetentionCohort[]> {
  const admin = createAdminClient();

  // Look back 12 weeks of cohorts to give the chart history.
  const cohortLookbackWeeks = 12;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - cohortLookbackWeeks * 7);
  since.setUTCHours(0, 0, 0, 0);

  // Pull users
  const allUsers: { id: string; created_at: string }[] = [];
  let page = 1;
  const perPage = 1000;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data?.users) break;
    for (const u of data.users) {
      if (u.created_at && new Date(u.created_at) >= since)
        allUsers.push({ id: u.id, created_at: u.created_at });
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  if (allUsers.length === 0) return [];

  const cohortByUser = new Map<string, string>();
  const cohorts = new Map<string, Set<string>>();
  for (const u of allUsers) {
    const wk = isoWeekMonday(new Date(u.created_at));
    cohortByUser.set(u.id, wk);
    if (!cohorts.has(wk)) cohorts.set(wk, new Set());
    cohorts.get(wk)!.add(u.id);
  }

  // Pull recent bookings to use as the "active" event
  const sinceIso = since.toISOString();
  const { data: bookings } = await admin
    .from("bookings")
    .select("seeker_id, caregiver_id, created_at")
    .gte("created_at", sinceIso)
    .limit(20000);

  // For each booking, mark cohort+week active
  // active map: cohort -> week_offset -> Set<userId>
  const active = new Map<string, Map<number, Set<string>>>();
  for (const b of bookings ?? []) {
    const ts = b.created_at as string;
    const dt = new Date(ts);
    const actWeek = isoWeekMonday(dt);

    for (const userId of [b.seeker_id, b.caregiver_id]) {
      if (!userId) continue;
      const cohort = cohortByUser.get(userId);
      if (!cohort) continue;
      const offset =
        Math.round(
          (new Date(actWeek).getTime() - new Date(cohort).getTime()) /
            (7 * 24 * 3600 * 1000),
        ) || 0;
      if (offset < 1 || offset > weeks) continue;
      let perCohort = active.get(cohort);
      if (!perCohort) {
        perCohort = new Map();
        active.set(cohort, perCohort);
      }
      let set = perCohort.get(offset);
      if (!set) {
        set = new Set();
        perCohort.set(offset, set);
      }
      set.add(userId);
    }
  }

  const result: RetentionCohort[] = [];
  for (const [cohort, members] of cohorts) {
    const ac = active.get(cohort) ?? new Map<number, Set<string>>();
    result.push({
      cohort_week: cohort,
      cohort_size: members.size,
      w1_retained: ac.get(1)?.size ?? 0,
      w2_retained: ac.get(2)?.size ?? 0,
      w3_retained: ac.get(3)?.size ?? 0,
      w4_retained: ac.get(4)?.size ?? 0,
    });
  }
  return result.sort((a, b) => (a.cohort_week < b.cohort_week ? 1 : -1));
}
