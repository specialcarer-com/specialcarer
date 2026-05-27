/**
 * Tests for the booking-tasks list handler.
 *
 * Drives the pure handler with a stubbed client (matches register-handler /
 * upcoming-handler conventions) so we don't pull in next/headers + cookie
 * machinery.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleListTasks,
  type BookingPartyRow,
  type ListTasksClient,
} from "@/lib/booking-tasks/list-handler";
import type { BookingTaskRow } from "@/lib/booking-tasks/types";

const SEEKER = "00000000-0000-0000-0000-000000000001";
const CARER = "00000000-0000-0000-0000-000000000002";
const STRANGER = "00000000-0000-0000-0000-000000000003";
const ADMIN = "00000000-0000-0000-0000-000000000004";
const BOOKING = "00000000-0000-0000-0000-0000000000aa";

function booking(): BookingPartyRow {
  return { id: BOOKING, seeker_id: SEEKER, caregiver_id: CARER };
}

function rows(): BookingTaskRow[] {
  return [
    {
      id: "t1",
      booking_id: BOOKING,
      label: "Help with bath",
      done: false,
      done_at: null,
      done_by: null,
      position: 0,
      created_by: SEEKER,
      created_at: "2026-05-27T08:00:00.000Z",
      updated_at: "2026-05-27T08:00:00.000Z",
    },
    {
      id: "t2",
      booking_id: BOOKING,
      label: "Medication 10am",
      done: true,
      done_at: "2026-05-27T10:01:00.000Z",
      done_by: CARER,
      position: 1,
      created_by: SEEKER,
      created_at: "2026-05-27T08:00:01.000Z",
      updated_at: "2026-05-27T10:01:00.000Z",
    },
  ];
}

function client(overrides?: Partial<ListTasksClient>): ListTasksClient {
  return {
    async getBooking() {
      return { data: booking(), error: null };
    },
    async listTasks() {
      return { data: rows(), error: null };
    },
    async isAdmin() {
      return false;
    },
    ...overrides,
  };
}

describe("handleListTasks", () => {
  it("returns 200 with ordered tasks for the carer on the booking", async () => {
    const res = await handleListTasks({
      user_id: CARER,
      booking_id: BOOKING,
      client: client(),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { tasks: BookingTaskRow[] };
    assert.deepEqual(
      body.tasks.map((t) => t.id),
      ["t1", "t2"],
    );
  });

  it("returns 200 for the seeker on the booking", async () => {
    const res = await handleListTasks({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client(),
    });
    assert.equal(res.status, 200);
  });

  it("returns 200 for an admin even when not on the booking", async () => {
    const res = await handleListTasks({
      user_id: ADMIN,
      booking_id: BOOKING,
      client: client({ async isAdmin() { return true; } }),
    });
    assert.equal(res.status, 200);
  });

  it("returns 403 for an unrelated user", async () => {
    const res = await handleListTasks({
      user_id: STRANGER,
      booking_id: BOOKING,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when the booking does not exist", async () => {
    const res = await handleListTasks({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client({
        async getBooking() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 500 when booking lookup fails", async () => {
    const res = await handleListTasks({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client({
        async getBooking() {
          return { data: null, error: { message: "boom" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });

  it("returns an empty array when the booking has no tasks", async () => {
    const res = await handleListTasks({
      user_id: CARER,
      booking_id: BOOKING,
      client: client({
        async listTasks() {
          return { data: [], error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { tasks: BookingTaskRow[] };
    assert.deepEqual(body.tasks, []);
  });
});
