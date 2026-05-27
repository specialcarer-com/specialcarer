import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleToggleTask,
  type ToggleTaskClient,
  type BookingCarerRow,
} from "@/lib/booking-tasks/toggle-handler";
import type {
  ApiBookingTaskResponse,
  BookingTaskRow,
} from "@/lib/booking-tasks/types";

export const dynamic = "force-dynamic";

export type { ApiBookingTaskResponse };

/**
 * PATCH /api/m/bookings/[id]/tasks/[taskId]
 *
 * Toggles a task done/undone. Only the assigned carer can call it
 * (seekers are read-only). On success, the row UPDATE is delivered to
 * every subscriber (seeker + carer + admins) via the supabase_realtime
 * publication on booking_tasks — no extra broadcast needed.
 */
export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: booking_id, taskId: task_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const client: ToggleTaskClient = {
    async getBookingCaregiver(id) {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, caregiver_id")
        .eq("id", id)
        .maybeSingle<BookingCarerRow>();
      return { data, error };
    },
    async getTask(id) {
      const { data, error } = await supabase
        .from("booking_tasks")
        .select("id, booking_id")
        .eq("id", id)
        .maybeSingle<{ id: string; booking_id: string }>();
      return { data, error };
    },
    async updateTask(id, patch) {
      const { data, error } = await supabase
        .from("booking_tasks")
        .update(patch)
        .eq("id", id)
        .select(
          "id, booking_id, label, done, done_at, done_by, position, created_by, created_at, updated_at",
        )
        .maybeSingle<BookingTaskRow>();
      return { data, error };
    },
  };

  return handleToggleTask({
    user_id: user.id,
    booking_id,
    task_id,
    body,
    client,
  });
}
