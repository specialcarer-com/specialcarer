import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInterviewsVideoEnabled } from "@/lib/video/flag";
import {
  createMeeting as wherebyCreateMeeting,
  deleteMeeting as wherebyDeleteMeeting,
} from "@/lib/video/whereby";
import {
  handleCreateRoom,
  handleGetRoom,
  handleDeleteRoom,
  type RoomClient,
  type InterviewRow,
  type InterviewRoomRow,
} from "@/lib/video/room-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thin Supabase + Whereby adapter shared by all three verbs. Participant
 * authorisation lives in the pure handler; reads/writes use the admin
 * (service-role) client because room provisioning is a server-trusted action.
 */
function buildClient(): RoomClient {
  const admin = createAdminClient();
  return {
    async getInterview(interviewId) {
      const { data, error } = await admin
        .from("interviews")
        .select(
          "id, carer_id, family_id, scheduled_start_at, scheduled_end_at, status",
        )
        .eq("id", interviewId)
        .maybeSingle<InterviewRow>();
      return { data, error };
    },
    async getLiveRoom(interviewId) {
      const { data, error } = await admin
        .from("interview_rooms")
        .select(
          "id, interview_id, meeting_id, host_room_url, viewer_room_url, start_date, end_date",
        )
        .eq("interview_id", interviewId)
        .is("deleted_at", null)
        .maybeSingle<InterviewRoomRow>();
      return { data, error };
    },
    async createMeeting(endDate) {
      const m = await wherebyCreateMeeting({ endDate });
      return {
        meetingId: m.meetingId,
        hostRoomUrl: m.hostRoomUrl,
        viewerRoomUrl: m.viewerRoomUrl,
        startDate: m.startDate,
        endDate: m.endDate,
      };
    },
    async insertRoom(input) {
      const { data, error } = await admin
        .from("interview_rooms")
        .insert({
          interview_id: input.interviewId,
          meeting_id: input.meetingId,
          host_room_url: input.hostRoomUrl,
          viewer_room_url: input.viewerRoomUrl,
          start_date: input.startDate,
          end_date: input.endDate,
          created_by: input.createdBy,
        })
        .select(
          "id, interview_id, meeting_id, host_room_url, viewer_room_url, start_date, end_date",
        )
        .maybeSingle<InterviewRoomRow>();
      return { data, error };
    },
    async deleteMeeting(meetingId) {
      await wherebyDeleteMeeting(meetingId);
    },
    async softDeleteRoom(roomId) {
      const { error } = await admin
        .from("interview_rooms")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", roomId);
      return { error };
    },
  };
}

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: interview_id } = await params;
  const userId = await authUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleCreateRoom({
    user_id: userId,
    interview_id,
    flagEnabled: isInterviewsVideoEnabled(),
    client: buildClient(),
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: interview_id } = await params;
  const userId = await authUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleGetRoom({
    user_id: userId,
    interview_id,
    flagEnabled: isInterviewsVideoEnabled(),
    client: buildClient(),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: interview_id } = await params;
  const userId = await authUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleDeleteRoom({
    user_id: userId,
    interview_id,
    flagEnabled: isInterviewsVideoEnabled(),
    client: buildClient(),
  });
}
