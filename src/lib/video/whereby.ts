/**
 * Whereby Embedded REST client wrapper.
 *
 * Thin typed client around the Whereby meetings API. Used by the interview
 * room routes to create/fetch/delete meetings. Auth is a Bearer API key read
 * from WHEREBY_API_KEY; the base URL is WHEREBY_API_BASE (default
 * https://api.whereby.dev/v1). All failures surface as a typed WherebyApiError
 * carrying the HTTP status + message.
 *
 * See vendor brief: Whereby Embedded — Build plan.
 */

const DEFAULT_BASE = "https://api.whereby.dev/v1";

function apiBase(): string {
  return process.env.WHEREBY_API_BASE || DEFAULT_BASE;
}

function apiKey(): string {
  const key = process.env.WHEREBY_API_KEY;
  if (!key) {
    throw new WherebyApiError(0, "Missing WHEREBY_API_KEY");
  }
  return key;
}

export class WherebyApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WherebyApiError";
    this.status = status;
  }
}

export type WherebyRoomMode = "normal" | "group";

export type CreateMeetingInput = {
  /** ISO-8601 timestamp after which the room is no longer joinable. */
  endDate: string;
  roomMode?: WherebyRoomMode;
  isLocked?: boolean;
};

/** Subset of the Whereby meeting payload we persist/consume. */
export type WherebyMeeting = {
  meetingId: string;
  startDate?: string;
  endDate: string;
  roomUrl?: string;
  hostRoomUrl: string;
  viewerRoomUrl: string;
};

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    throw new WherebyApiError(0, message);
  }

  if (!res.ok) {
    let message = `Whereby request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      // non-JSON error body; keep the default message
    }
    throw new WherebyApiError(res.status, message);
  }

  // DELETE returns 204 with no body.
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function createMeeting(
  input: CreateMeetingInput,
): Promise<WherebyMeeting> {
  const { endDate, roomMode = "normal", isLocked = true } = input;
  return request<WherebyMeeting>("/meetings", {
    method: "POST",
    body: JSON.stringify({
      endDate,
      roomMode,
      isLocked,
      fields: ["hostRoomUrl", "viewerRoomUrl"],
    }),
  });
}

export async function getMeeting(meetingId: string): Promise<WherebyMeeting> {
  return request<WherebyMeeting>(
    `/meetings/${encodeURIComponent(meetingId)}`,
    { method: "GET" },
  );
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  await request<void>(`/meetings/${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
  });
}
