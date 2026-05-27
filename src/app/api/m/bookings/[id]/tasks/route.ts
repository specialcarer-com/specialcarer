import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleListTasks,
  type ListTasksClient,
  type BookingPartyRow,
} from "@/lib/booking-tasks/list-handler";
import type {
  ApiBookingTasksResponse,
  BookingTaskRow,
} from "@/lib/booking-tasks/types";

export const dynamic = "force-dynamic";

export type { ApiBookingTasksResponse };

/**
 * GET /api/m/bookings/[id]/tasks
 *
 * Returns the task list for the booking, ordered by position asc then
 * created_at asc. Visible to the seeker, the assigned caregiver, and
 * admins. RLS gates rows in addition to the application-level guard.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: booking_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client: ListTasksClient = {
    async getBooking(id) {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, seeker_id, caregiver_id")
        .eq("id", id)
        .maybeSingle<BookingPartyRow>();
      return { data, error };
    },
    async listTasks(id) {
      const { data, error } = await supabase
        .from("booking_tasks")
        .select(
          "id, booking_id, label, done, done_at, done_by, position, created_by, created_at, updated_at",
        )
        .eq("booking_id", id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      return {
        data: (data as BookingTaskRow[] | null) ?? null,
        error,
      };
    },
    async isAdmin(uid) {
      // Use the admin client + the public.is_admin() helper that already
      // backs the sos_alerts admin policy.
      try {
        const admin = createAdminClient();
        const { data } = await admin.rpc("is_admin", { uid });
        return Boolean(data);
      } catch {
        return false;
      }
    },
  };

  return handleListTasks({
    user_id: user.id,
    booking_id,
    client,
  });
}
