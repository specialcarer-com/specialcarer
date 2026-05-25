/**
 * Pure handler for GET /api/m/carers/recent.
 *
 * Returns the seeker's most recently engaged carers — distinct caregiver_id
 * across recent bookings (status in completed/in_progress/accepted), ordered
 * by the most recent shift start. Used by the seeker home "Book again"
 * quick-rebook tiles.
 *
 * Split out from the route file so unit tests can drive the logic with a
 * stubbed Supabase client without pulling in next/headers + cookies
 * (matches the pattern in src/lib/push/register-handler.ts).
 */
import { NextResponse } from "next/server";

const REBOOKABLE_STATUSES = ["completed", "in_progress", "accepted"] as const;

const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 8;

export type ApiRecentCarer = {
  id: string;
  name: string;
  avatar_url: string | null;
  headline: string | null;
  service: string | null;
  last_booked_at: string;
};

export type ApiRecentCarersResponse = {
  carers: ApiRecentCarer[];
};

type BookingRow = {
  caregiver_id: string | null;
  starts_at: string | null;
  service_type: string | null;
};

type CaregiverProfileRow = {
  user_id: string;
  display_name: string | null;
  photo_url: string | null;
  headline: string | null;
  services: string[] | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

/**
 * Minimal interface of the Supabase client we touch. Mirrors the shape
 * returned by createClient() so tests can stub it without the full
 * @supabase/supabase-js types.
 */
export type RecentCarersClient = {
  from(table: "bookings"): {
    select(cols: string): {
      eq(
        col: "seeker_id",
        value: string,
      ): {
        in(
          col: "status",
          values: readonly string[],
        ): {
          order(
            col: "starts_at",
            opts: { ascending: boolean },
          ): {
            limit(n: number): Promise<{
              data: BookingRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  from(table: "caregiver_profiles"): {
    select(cols: string): {
      in(
        col: "user_id",
        ids: string[],
      ): Promise<{
        data: CaregiverProfileRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };
  from(table: "profiles"): {
    select(cols: string): {
      in(
        col: "id",
        ids: string[],
      ): Promise<{
        data: ProfileRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/** Parse and clamp the `limit` query param. */
export function parseLimit(raw: string | null): number {
  if (raw == null) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export async function handleRecentCarers(args: {
  seeker_id: string;
  client: RecentCarersClient;
  limit: number;
}): Promise<NextResponse> {
  const { seeker_id, client, limit } = args;

  // Pull a generous slice of recent bookings so we can dedupe carer-side
  // and still satisfy `limit` distinct carers. 4x is plenty in practice.
  const fetchSlice = Math.max(limit * 4, 16);

  const { data: rows, error } = await client
    .from("bookings")
    .select("caregiver_id, starts_at, service_type")
    .eq("seeker_id", seeker_id)
    .in("status", REBOOKABLE_STATUSES)
    .order("starts_at", { ascending: false })
    .limit(fetchSlice);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as BookingRow[];

  // Dedupe by carer_id, keep newest booking per carer (rows already
  // ordered DESC by starts_at, so first-write wins).
  const firstByCarer = new Map<
    string,
    { last_booked_at: string; service: string | null }
  >();
  for (const r of list) {
    if (!r.caregiver_id || !r.starts_at) continue;
    if (firstByCarer.has(r.caregiver_id)) continue;
    firstByCarer.set(r.caregiver_id, {
      last_booked_at: r.starts_at,
      service: r.service_type ?? null,
    });
    if (firstByCarer.size >= limit) break;
  }

  if (firstByCarer.size === 0) {
    const empty: ApiRecentCarersResponse = { carers: [] };
    return NextResponse.json(empty);
  }

  const orderedIds = Array.from(firstByCarer.keys());

  // Fetch carer profiles + base profile rows in parallel.
  const [cgRes, profRes] = await Promise.all([
    client
      .from("caregiver_profiles")
      .select("user_id, display_name, photo_url, headline, services")
      .in("user_id", orderedIds),
    client
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", orderedIds),
  ]);

  if (cgRes.error) {
    return NextResponse.json({ error: cgRes.error.message }, { status: 500 });
  }
  if (profRes.error) {
    return NextResponse.json({ error: profRes.error.message }, { status: 500 });
  }

  const cgById = new Map<string, CaregiverProfileRow>();
  for (const r of (cgRes.data ?? []) as CaregiverProfileRow[]) {
    cgById.set(r.user_id, r);
  }
  const profById = new Map<string, ProfileRow>();
  for (const r of (profRes.data ?? []) as ProfileRow[]) {
    profById.set(r.id, r);
  }

  const carers: ApiRecentCarer[] = orderedIds.map((id) => {
    const cg = cgById.get(id);
    const prof = profById.get(id);
    const meta = firstByCarer.get(id)!;
    const name =
      cg?.display_name ||
      prof?.full_name ||
      "Caregiver";
    const avatar_url = cg?.photo_url ?? prof?.avatar_url ?? null;
    const primaryService =
      (cg?.services ?? []).find(
        (s): s is string => typeof s === "string" && s.length > 0,
      ) ?? null;
    return {
      id,
      name,
      avatar_url,
      headline: cg?.headline ?? null,
      service: meta.service ?? primaryService,
      last_booked_at: meta.last_booked_at,
    };
  });

  const response: ApiRecentCarersResponse = { carers };
  return NextResponse.json(response);
}

export { REBOOKABLE_STATUSES, DEFAULT_LIMIT, MAX_LIMIT };
