/**
 * Tests for the booking-tasks toggle handler.
 *
 * Drives the pure handler with a stubbed client; verifies validation,
 * authorisation (seekers blocked, only the assigned carer toggles), and
 * the done_at / done_by stamping invariants. Realtime emit is implicit —
 * the UPDATE on the booking_tasks row is fanned out by supabase_realtime
 * publication (see 20260527131100_booking_tasks.sql); we don't .send() in the
 * handler so there's no extra emit to mock.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleToggleTask,
  type BookingCarerRow,
  type ToggleTaskClient,
} from "@/lib/booking-tasks/toggle-handler";
import type { BookingTaskRow } from "@/lib/booking-tasks/types";

const SEEKER = "00000000-0000-0000-0000-000000000001";
const CARER = "00000000-0000-0000-0000-000000000002";
const STRANGER = "00000000-0000-0000-0000-000000000003";
const BOOKING = "00000000-0000-0000-0000-0000000000aa";
const TASK = "00000000-0000-0000-0000-0000000000bb";
const NOW = new Date("2026-05-27T10:00:00.000Z");

function bookingCarer(): BookingCarerRow {
  return { id: BOOKING, caregiver_id: CARER };
}

type UpdateCapture = {
  taskId: string;
  patch: {
    done: boolean;
    done_at: string | null;
    done_by: string | null;
    updated_at: string;
  };
};

function client(opts?: {
  capture?: UpdateCapture[];
  getBookingOverride?: ToggleTaskClient["getBookingCaregiver"];
  getTaskOverride?: ToggleTaskClient["getTask"];
  updateOverride?: ToggleTaskClient["updateTask"];
}): ToggleTaskClient {
  return {
    async getBookingCaregiver() {
      return { data: bookingCarer(), error: null };
    },
    async getTask() {
      return {
        data: { id: TASK, booking_id: BOOKING },
        error: null,
      };
    },
    async updateTask(taskId, patch) {
      opts?.capture?.push({ taskId, patch });
      const updated: BookingTaskRow = {
        id: taskId,
        booking_id: BOOKING,
        label: "Help with bath",
        done: patch.done,
        done_at: patch.done_at,
        done_by: patch.done_by,
        position: 0,
        created_by: SEEKER,
        created_at: "2026-05-27T08:00:00.000Z",
        updated_at: patch.updated_at,
      };
      return { data: updated, error: null };
    },
    ...(opts?.getBookingOverride
      ? { getBookingCaregiver: opts.getBookingOverride }
      : {}),
    ...(opts?.getTaskOverride ? { getTask: opts.getTaskOverride } : {}),
    ...(opts?.updateOverride ? { updateTask: opts.updateOverride } : {}),
  };
}

describe("handleToggleTask", () => {
  it("toggling done=true stamps done_at and done_by", async () => {
    const captured: UpdateCapture[] = [];
    const res = await handleToggleTask({
      user_id: CARER,
      booking_id: BOOKING,
      task_id: TASK,
      body: { done: true },
      client: client({ capture: captured }),
      now: NOW,
    });
    assert.equal(res.status, 200);
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.patch.done, true);
    assert.equal(captured[0]?.patch.done_at, NOW.toISOString());
    assert.equal(captured[0]?.patch.done_by, CARER);
    assert.equal(captured[0]?.patch.updated_at, NOW.toISOString());
  });

  it("toggling done=false clears done_at and done_by", async () => {
    const captured: UpdateCapture[] = [];
    const res = await handleToggleTask({
      user_id: CARER,
      booking_id: BOOKING,
      task_id: TASK,
      body: { done: false },
      client: client({ capture: captured }),
      now: NOW,
    });
    assert.equal(res.status, 200);
    assert.equal(captured[0]?.patch.done, false);
    assert.equal(captured[0]?.patch.done_at, null);
    assert.equal(captured[0]?.patch.done_by, null);
    assert.equal(captured[0]?.patch.updated_at, NOW.toISOString());
  });

  it("returns 403 when the seeker tries to toggle (read-only)", async () => {
    const res = await handleToggleTask({
      user_id: SEEKER,
      booking_id: BOOKING,
      task_id: TASK,
      body: { done: true },
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 403);
  });

  it("returns 403 for an unrelated user", async () => {
    const res = await handleToggleTask({
      user_id: STRANGER,
      booking_id: BOOKING,
      task_id: TASK,
      body: { done: true },
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 403);
  });

  it("returns 400 when body is missing done", async () => {
    const res = await handleToggleTask({
      user_id: CARER,
      booking_id: BOOKING,
      task_id: TASK,
      body: {},
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when done is not a boolean", async () => {
    const res = await handleToggleTask({
      user_id: CARER,
      booking_id: BOOKING,
      task_id: TASK,
      body: { done: "yes" },
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when body is not a JSON object", async () => {
    const res = await handleToggleTask({
      user_id: CARER,
      booking_id: BOOKING,
      task_id: TASK,
      body: null,
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 400);
  });

  it("returns 404 when the booking does not exist", async () => {
    const res = await handleToggleTask({
      user_id: CARER,
      booking_id: BOOKING,
      task_id: TASK,
      body: { done: true },
      client: client({
        getBookingOverride: async () => ({ data: null, error: null }),
      }),
      now: NOW,
    });
    assert.equal(res.status, 404);
  });

  it("returns 404 when the task belongs to a different booking", async () => {
    const res = await handleToggleTask({
      user_id: CARER,
      booking_id: BOOKING,
      task_id: TASK,
      body: { done: true },
      client: client({
        getTaskOverride: async () => ({
          data: { id: TASK, booking_id: "different-booking" },
          error: null,
        }),
      }),
      now: NOW,
    });
    assert.equal(res.status, 404);
  });

  it("returns 500 when the update query fails", async () => {
    const res = await handleToggleTask({
      user_id: CARER,
      booking_id: BOOKING,
      task_id: TASK,
      body: { done: true },
      client: client({
        updateOverride: async () => ({
          data: null,
          error: { message: "boom" },
        }),
      }),
      now: NOW,
    });
    assert.equal(res.status, 500);
  });
});
