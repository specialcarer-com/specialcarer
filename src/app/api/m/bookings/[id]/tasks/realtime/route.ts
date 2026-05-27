import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bookingTasksRealtimeConfig } from "@/lib/booking-tasks/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/bookings/[id]/tasks/realtime
 *
 * Mirrors the chat realtime config endpoint: hands the browser the
 * channel topic, filter, and the public Supabase credentials so it can
 * open a postgres_changes subscription on booking_tasks. RLS gates row
 * delivery (carer + seeker on the booking + admins); we still 403 non-
 * parties here as defence in depth so we don't leak booking ids.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, seeker_id, caregiver_id")
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      caregiver_id: string | null;
    }>();
  if (error) {
    return NextResponse.json(
      { error: "Failed to load booking" },
      { status: 500 },
    );
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (
    booking.seeker_id !== user.id &&
    booking.caregiver_id !== user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    config: bookingTasksRealtimeConfig(bookingId),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  });
}
