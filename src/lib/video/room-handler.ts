/**
 * Pure handlers for the interview room routes:
 *   POST   /api/m/interviews/[id]/room   — create (or return existing) room
 *   GET    /api/m/interviews/[id]/room   — fetch the live room
 *   DELETE /api/m/interviews/[id]/room   — family-only soft delete + Whereby delete
 *
 * The route resolves auth + builds a thin Supabase/Whereby adapter; these
 * functions own the flag gate, participant authorisation, and the role-aware
 * URL selection — so tests drive them with a stubbed client (same convention
 * as designated-payer-handler.ts).
 *
 * Role rule: the family gets the host URL, the carer gets the viewer URL. The
 * role is decided server-side from the interview's family_id / carer_id; the
 * URL the caller doesn't get is never returned to them.
 */
import { NextResponse } from "next/server";

/** Window (ms) added after scheduled_end_at for the Whereby room endDate. */
export const ROOM_GRACE_MS = 15 * 60 * 1000;

export type InterviewRow = {
  id: string;
  carer_id: string;
  family_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: string;
};

export type InterviewRoomRow = {
  id: string;
  interview_id: string;
  meeting_id: string;
  host_room_url: string;
  viewer_room_url: string;
  start_date: string;
  end_date: string;
};

export type CreatedMeeting = {
  meetingId: string;
  hostRoomUrl: string;
  viewerRoomUrl: string;
  startDate?: string;
  endDate: string;
};

export type RoomClient = {
  getInterview(interviewId: string): Promise<{
    data: InterviewRow | null;
    error: { message: string } | null;
  }>;
  /** The single live (deleted_at IS NULL) room for an interview, if any. */
  getLiveRoom(interviewId: string): Promise<{
    data: InterviewRoomRow | null;
    error: { message: string } | null;
  }>;
  createMeeting(endDate: string): Promise<CreatedMeeting>;
  insertRoom(input: {
    interviewId: string;
    meetingId: string;
    hostRoomUrl: string;
    viewerRoomUrl: string;
    startDate: string;
    endDate: string;
    createdBy: string;
  }): Promise<{ data: InterviewRoomRow | null; error: { message: string } | null }>;
  deleteMeeting(meetingId: string): Promise<void>;
  softDeleteRoom(roomId: string): Promise<{ error: { message: string } | null }>;
};

type Role = "family" | "carer";

function roleFor(interview: InterviewRow, userId: string): Role | null {
  if (interview.family_id === userId) return "family";
  if (interview.carer_id === userId) return "carer";
  return null;
}

function roomUrlFor(
  role: Role,
  urls: { hostRoomUrl: string; viewerRoomUrl: string },
): string {
  return role === "family" ? urls.hostRoomUrl : urls.viewerRoomUrl;
}

export type RoomResponse = {
  meetingId: string;
  roomUrl: string;
  role: Role;
  startDate: string;
  endDate: string;
};

const FEATURE_DISABLED = { error: "feature disabled" } as const;

export type HandleInput = {
  user_id: string;
  interview_id: string;
  flagEnabled: boolean;
  client: RoomClient;
};

/** Loads the interview and resolves the caller's role, or a NextResponse error. */
async function loadInterviewForParticipant(
  input: HandleInput,
): Promise<{ interview: InterviewRow; role: Role } | NextResponse> {
  const { user_id, interview_id, flagEnabled, client } = input;

  if (!flagEnabled) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const res = await client.getInterview(interview_id);
  if (res.error) {
    return NextResponse.json(
      { error: "Failed to load interview" },
      { status: 500 },
    );
  }
  if (!res.data) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const role = roleFor(res.data, user_id);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { interview: res.data, role };
}

export async function handleCreateRoom(
  input: HandleInput,
): Promise<NextResponse> {
  const loaded = await loadInterviewForParticipant(input);
  if (loaded instanceof NextResponse) return loaded;
  const { interview, role } = loaded;
  const { client, user_id } = input;

  // Idempotent: if a live room already exists, return it (role-aware).
  const existing = await client.getLiveRoom(interview.id);
  if (existing.error) {
    return NextResponse.json(
      { error: "Failed to load room" },
      { status: 500 },
    );
  }
  if (existing.data) {
    return NextResponse.json(roomResponse(existing.data, role), { status: 200 });
  }

  const endDate = new Date(
    new Date(interview.scheduled_end_at).getTime() + ROOM_GRACE_MS,
  ).toISOString();

  let meeting: CreatedMeeting;
  try {
    meeting = await client.createMeeting(endDate);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create meeting";
    // Upstream Whereby failure → 502 Bad Gateway.
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const inserted = await client.insertRoom({
    interviewId: interview.id,
    meetingId: meeting.meetingId,
    hostRoomUrl: meeting.hostRoomUrl,
    viewerRoomUrl: meeting.viewerRoomUrl,
    startDate: meeting.startDate ?? interview.scheduled_start_at,
    endDate: meeting.endDate,
    createdBy: user_id,
  });
  if (inserted.error || !inserted.data) {
    return NextResponse.json(
      { error: "Failed to persist room" },
      { status: 500 },
    );
  }

  return NextResponse.json(roomResponse(inserted.data, role), { status: 201 });
}

export async function handleGetRoom(input: HandleInput): Promise<NextResponse> {
  const loaded = await loadInterviewForParticipant(input);
  if (loaded instanceof NextResponse) return loaded;
  const { interview, role } = loaded;

  const existing = await input.client.getLiveRoom(interview.id);
  if (existing.error) {
    return NextResponse.json(
      { error: "Failed to load room" },
      { status: 500 },
    );
  }
  if (!existing.data) {
    return NextResponse.json({ error: "No room yet" }, { status: 404 });
  }
  return NextResponse.json(roomResponse(existing.data, role), { status: 200 });
}

export async function handleDeleteRoom(
  input: HandleInput,
): Promise<NextResponse> {
  const loaded = await loadInterviewForParticipant(input);
  if (loaded instanceof NextResponse) return loaded;
  const { interview, role } = loaded;
  const { client } = input;

  // Only the family may tear down a room.
  if (role !== "family") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await client.getLiveRoom(interview.id);
  if (existing.error) {
    return NextResponse.json(
      { error: "Failed to load room" },
      { status: 500 },
    );
  }
  if (!existing.data) {
    return NextResponse.json({ error: "No room yet" }, { status: 404 });
  }

  try {
    await client.deleteMeeting(existing.data.meeting_id);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to delete meeting";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const del = await client.softDeleteRoom(existing.data.id);
  if (del.error) {
    return NextResponse.json(
      { error: "Failed to delete room" },
      { status: 500 },
    );
  }
  return NextResponse.json({ deleted: true }, { status: 200 });
}

function roomResponse(row: InterviewRoomRow, role: Role): RoomResponse {
  return {
    meetingId: row.meeting_id,
    roomUrl: roomUrlFor(role, {
      hostRoomUrl: row.host_room_url,
      viewerRoomUrl: row.viewer_room_url,
    }),
    role,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}
