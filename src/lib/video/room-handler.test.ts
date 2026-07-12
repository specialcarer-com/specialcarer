/**
 * Tests for the interview room handlers. Driven with a stubbed RoomClient
 * (same convention as designated-payer-handler.test.ts) so no Supabase /
 * next/headers machinery is pulled in.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleCreateRoom,
  handleGetRoom,
  handleDeleteRoom,
  ROOM_GRACE_MS,
  type RoomClient,
  type InterviewRow,
  type InterviewRoomRow,
} from "./room-handler";
import { WherebyApiError } from "./whereby";

const FAMILY = "00000000-0000-0000-0000-000000000001";
const CARER = "00000000-0000-0000-0000-000000000002";
const OUTSIDER = "00000000-0000-0000-0000-000000000009";
const INTERVIEW = "00000000-0000-0000-0000-0000000000aa";

const START = "2026-06-20T10:00:00.000Z";
const END = "2026-06-20T10:30:00.000Z";

function interview(): InterviewRow {
  return {
    id: INTERVIEW,
    carer_id: CARER,
    family_id: FAMILY,
    scheduled_start_at: START,
    scheduled_end_at: END,
    status: "scheduled",
  };
}

function roomRow(): InterviewRoomRow {
  return {
    id: "room-1",
    interview_id: INTERVIEW,
    meeting_id: "meet-1",
    host_room_url: "https://host",
    viewer_room_url: "https://viewer",
    start_date: START,
    end_date: "2026-06-20T10:45:00.000Z",
  };
}

function client(overrides?: Partial<RoomClient>): RoomClient {
  const base: RoomClient = {
    async getInterview() {
      return { data: interview(), error: null };
    },
    async getLiveRoom() {
      return { data: null, error: null };
    },
    async createMeeting(endDate) {
      return {
        meetingId: "meet-1",
        hostRoomUrl: "https://host",
        viewerRoomUrl: "https://viewer",
        startDate: START,
        endDate,
      };
    },
    async insertRoom(input) {
      return {
        data: {
          id: "room-1",
          interview_id: input.interviewId,
          meeting_id: input.meetingId,
          host_room_url: input.hostRoomUrl,
          viewer_room_url: input.viewerRoomUrl,
          start_date: input.startDate,
          end_date: input.endDate,
        },
        error: null,
      };
    },
    async deleteMeeting() {},
    async softDeleteRoom() {
      return { error: null };
    },
  };
  return { ...base, ...overrides };
}

describe("handleCreateRoom", () => {
  it("returns 403 feature disabled when the flag is off", async () => {
    const res = await handleCreateRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: string }).error, "feature disabled");
  });

  it("family creates a room and gets the host URL (201)", async () => {
    const res = await handleCreateRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { roomUrl: string; role: string };
    assert.equal(body.role, "family");
    assert.equal(body.roomUrl, "https://host");
  });

  it("computes endDate as scheduled_end_at + 15min", async () => {
    let captured = "";
    const res = await handleCreateRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async createMeeting(endDate) {
          captured = endDate;
          return {
            meetingId: "m",
            hostRoomUrl: "h",
            viewerRoomUrl: "v",
            endDate,
          };
        },
      }),
    });
    assert.equal(res.status, 201);
    const expected = new Date(
      new Date(END).getTime() + ROOM_GRACE_MS,
    ).toISOString();
    assert.equal(captured, expected);
  });

  it("carer creating gets the viewer URL", async () => {
    const res = await handleCreateRoom({
      user_id: CARER,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { roomUrl: string; role: string };
    assert.equal(body.role, "carer");
    assert.equal(body.roomUrl, "https://viewer");
  });

  it("is idempotent: returns existing live room (200) without creating", async () => {
    let created = false;
    const res = await handleCreateRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async getLiveRoom() {
          return { data: roomRow(), error: null };
        },
        async createMeeting(endDate) {
          created = true;
          return {
            meetingId: "x",
            hostRoomUrl: "h",
            viewerRoomUrl: "v",
            endDate,
          };
        },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(created, false);
  });

  it("returns 403 for a non-participant", async () => {
    const res = await handleCreateRoom({
      user_id: OUTSIDER,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when the interview is missing", async () => {
    const res = await handleCreateRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async getInterview() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 502 when Whereby createMeeting fails", async () => {
    const res = await handleCreateRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async createMeeting() {
          throw new WherebyApiError(500, "upstream down");
        },
      }),
    });
    assert.equal(res.status, 502);
  });

  it("returns 500 when persisting the room fails", async () => {
    const res = await handleCreateRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async insertRoom() {
          return { data: null, error: { message: "db down" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });
});

describe("handleGetRoom", () => {
  it("returns 403 when the flag is off", async () => {
    const res = await handleGetRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("carer joins an existing room and gets the viewer URL (200)", async () => {
    const res = await handleGetRoom({
      user_id: CARER,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async getLiveRoom() {
          return { data: roomRow(), error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { roomUrl: string; role: string };
    assert.equal(body.role, "carer");
    assert.equal(body.roomUrl, "https://viewer");
  });

  it("returns 404 when no room exists yet", async () => {
    const res = await handleGetRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 404);
  });

  it("returns 403 for a non-participant", async () => {
    const res = await handleGetRoom({
      user_id: OUTSIDER,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async getLiveRoom() {
          return { data: roomRow(), error: null };
        },
      }),
    });
    assert.equal(res.status, 403);
  });
});

describe("handleDeleteRoom", () => {
  it("returns 403 when the flag is off", async () => {
    const res = await handleDeleteRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("family deletes the meeting and soft-deletes the row (200)", async () => {
    let deletedMeeting = "";
    let softDeleted = "";
    const res = await handleDeleteRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async getLiveRoom() {
          return { data: roomRow(), error: null };
        },
        async deleteMeeting(id) {
          deletedMeeting = id;
        },
        async softDeleteRoom(id) {
          softDeleted = id;
          return { error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(deletedMeeting, "meet-1");
    assert.equal(softDeleted, "room-1");
  });

  it("returns 403 when a carer attempts delete", async () => {
    const res = await handleDeleteRoom({
      user_id: CARER,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async getLiveRoom() {
          return { data: roomRow(), error: null };
        },
      }),
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when there is no live room", async () => {
    const res = await handleDeleteRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 404);
  });

  it("returns 502 when Whereby deleteMeeting fails", async () => {
    const res = await handleDeleteRoom({
      user_id: FAMILY,
      interview_id: INTERVIEW,
      flagEnabled: true,
      client: client({
        async getLiveRoom() {
          return { data: roomRow(), error: null };
        },
        async deleteMeeting() {
          throw new WherebyApiError(500, "boom");
        },
      }),
    });
    assert.equal(res.status, 502);
  });
});
