import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  BOOKING_EVENT_COLUMNS,
  type BookingEventRow,
} from "@/lib/calendar/bookingEvent";
import {
  authorizeBookingExport,
  buildBookingIcs,
} from "@/lib/calendar/handlers";

export const dynamic = "force-dynamic";

type Row = BookingEventRow & {
  seeker_id: string;
  caregiver_id: string | null;
};

/**
 * GET /api/m/bookings/[id]/ics
 *
 * Session-authed per-booking .ics download. Caller must be the seeker or the
 * assigned carer (403/404 otherwise). Served as an attachment so the calendar
 * client treats it as an importable invite (METHOD:REQUEST).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row } = await supabase
    .from("bookings")
    .select(`${BOOKING_EVENT_COLUMNS}, seeker_id, caregiver_id`)
    .eq("id", id)
    .maybeSingle<Row>();

  const gate = authorizeBookingExport({
    userId: user?.id ?? null,
    seekerId: row?.seeker_id,
    caregiverId: row?.caregiver_id ?? null,
    bookingExists: Boolean(row),
  });
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = buildBookingIcs(row as Row);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="specialcarer-${id}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
