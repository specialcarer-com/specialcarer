/**
 * Shared types for the per-booking task checklist (P1-B4).
 *
 * Kept dependency-free so both the server handlers and the client UI can
 * import the same row shape without dragging in @supabase/supabase-js.
 */

export type BookingTaskRow = {
  id: string;
  booking_id: string;
  label: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiBookingTasksResponse = {
  tasks: BookingTaskRow[];
};

export type ApiBookingTaskResponse = {
  task: BookingTaskRow;
};

/**
 * Realtime channel topic + table filter for booking task updates.
 * Mirrors `chatRealtimeConfig` so the client can subscribe via
 * postgres_changes. RLS gates per-row delivery (carer + seeker on the
 * booking both receive UPDATE events).
 */
export type BookingTasksRealtimeConfig = {
  channelTopic: string;
  table: "booking_tasks";
  filter: string;
};

export function bookingTasksRealtimeConfig(
  bookingId: string,
): BookingTasksRealtimeConfig {
  return {
    channelTopic: `booking-tasks:${bookingId}`,
    table: "booking_tasks",
    filter: `booking_id=eq.${bookingId}`,
  };
}
