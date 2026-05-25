import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleUpcoming,
  parseLimit,
  type UpcomingQueryClient,
  type ApiUpcomingBooking,
  type ApiUpcomingBookingsResponse,
} from "@/lib/bookings/upcoming-handler";

export const dynamic = "force-dynamic";

export type { ApiUpcomingBooking, ApiUpcomingBookingsResponse };

/**
 * GET /api/m/bookings/upcoming?limit=3
 *
 * Returns the signed-in seeker's next-N upcoming bookings (default 3,
 * capped at 20), ordered by starts_at ASC. RLS gates visibility to the
 * caller's own rows; we additionally scope by seeker_id to skip rows
 * where the caller appears as the caregiver counterparty.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));

  // Adapter: wrap the real supabase client so the pure handler can stay
  // independent of @supabase/supabase-js types.
  const client: UpcomingQueryClient = {
    from(table) {
      return supabase.from(table) as unknown as ReturnType<
        UpcomingQueryClient["from"]
      >;
    },
    from2: {
      async caregiver_profiles(ids) {
        const { data, error } = await supabase
          .from("caregiver_profiles")
          .select("user_id, display_name, photo_url")
          .in("user_id", ids as string[]);
        return { data: (data as never) ?? null, error };
      },
      async profiles(ids) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", ids as string[]);
        return { data: (data as never) ?? null, error };
      },
    },
  };

  return handleUpcoming({ user_id: user.id, client, limit });
}
