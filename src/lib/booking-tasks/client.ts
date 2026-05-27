/**
 * Browser-side fetch helpers for the booking task checklist.
 * Mirrors `src/lib/chat/client.ts` so the API surface feels
 * consistent across the app.
 */
import type {
  ApiBookingTasksResponse,
  ApiBookingTaskResponse,
  BookingTaskRow,
} from "./types";

export type TasksRealtimeConfig = {
  config: { channelTopic: string; table: "booking_tasks"; filter: string };
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export async function fetchTasks(
  bookingId: string,
): Promise<BookingTaskRow[]> {
  const res = await fetch(
    `/api/m/bookings/${encodeURIComponent(bookingId)}/tasks`,
    { credentials: "include", cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`tasks_fetch_failed_${res.status}`);
  }
  const json = (await res.json()) as ApiBookingTasksResponse;
  return json.tasks;
}

export async function toggleTask(
  bookingId: string,
  taskId: string,
  done: boolean,
): Promise<BookingTaskRow> {
  const res = await fetch(
    `/api/m/bookings/${encodeURIComponent(bookingId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    },
  );
  if (!res.ok) {
    throw new Error(`tasks_toggle_failed_${res.status}`);
  }
  const json = (await res.json()) as ApiBookingTaskResponse;
  return json.task;
}

export async function fetchTasksRealtimeConfig(
  bookingId: string,
): Promise<TasksRealtimeConfig> {
  const res = await fetch(
    `/api/m/bookings/${encodeURIComponent(bookingId)}/tasks/realtime`,
    { credentials: "include", cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`tasks_realtime_config_failed_${res.status}`);
  }
  return (await res.json()) as TasksRealtimeConfig;
}
