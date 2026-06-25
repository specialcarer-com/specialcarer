/**
 * Pure handler for PATCH /api/m/bookings/[id]/tasks/[taskId].
 *
 * Only the carer assigned to the booking can toggle a task (seekers are
 * read-only). On done: set done_at + done_by; on undone: clear them.
 *
 * Realtime fan-out is automatic via supabase_realtime postgres_changes
 * on the booking_tasks table — we don't need to .send() anything; the
 * UPDATE row event is delivered to every subscriber whose RLS lets them
 * see the row (carer + seeker + admins). See migration
 * 20260527131100_booking_tasks.sql for the publication grant.
 */
import { NextResponse } from "next/server";
import type { BookingTaskRow, ApiBookingTaskResponse } from "./types";

export type BookingCarerRow = {
  id: string;
  caregiver_id: string;
};

/** Minimal DB shape — see list-handler.ts for the same convention. */
export type ToggleTaskClient = {
  getBookingCaregiver(
    bookingId: string,
  ): Promise<{
    data: BookingCarerRow | null;
    error: { message: string } | null;
  }>;
  getTask(
    taskId: string,
  ): Promise<{
    data: { id: string; booking_id: string } | null;
    error: { message: string } | null;
  }>;
  updateTask(
    taskId: string,
    patch: {
      done: boolean;
      done_at: string | null;
      done_by: string | null;
      updated_at: string;
    },
  ): Promise<{
    data: BookingTaskRow | null;
    error: { message: string } | null;
  }>;
};

export type HandleToggleInput = {
  user_id: string;
  booking_id: string;
  task_id: string;
  body: unknown;
  client: ToggleTaskClient;
  now?: Date;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function handleToggleTask(
  input: HandleToggleInput,
): Promise<NextResponse<ApiBookingTaskResponse | { error: string }>> {
  const { user_id, booking_id, task_id, body, client, now } = input;

  // Inline TS validation — zod is not a repo dep.
  if (!isPlainObject(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  if (typeof body.done !== "boolean") {
    return NextResponse.json(
      { error: "Field `done` must be a boolean" },
      { status: 400 },
    );
  }
  const done = body.done;

  // Authorisation: only the assigned carer may toggle.
  const booking = await client.getBookingCaregiver(booking_id);
  if (booking.error) {
    return NextResponse.json(
      { error: "Failed to load booking" },
      { status: 500 },
    );
  }
  if (!booking.data) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.data.caregiver_id !== user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Make sure the task actually belongs to this booking — defence in
  // depth against a hostile client mixing booking ids and task ids.
  const task = await client.getTask(task_id);
  if (task.error) {
    return NextResponse.json(
      { error: "Failed to load task" },
      { status: 500 },
    );
  }
  if (!task.data) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.data.booking_id !== booking_id) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const nowIso = (now ?? new Date()).toISOString();
  const patch = done
    ? {
        done: true,
        done_at: nowIso,
        done_by: user_id,
        updated_at: nowIso,
      }
    : {
        done: false,
        done_at: null,
        done_by: null,
        updated_at: nowIso,
      };

  const updated = await client.updateTask(task_id, patch);
  if (updated.error || !updated.data) {
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 },
    );
  }

  return NextResponse.json({ task: updated.data }, { status: 200 });
}
