"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "../../_components/ui";

/** Window (ms) before scheduled start when the Join button unlocks. */
const JOIN_WINDOW_MS = 10 * 60 * 1000;

type RoomResponse = {
  meetingId: string;
  roomUrl: string;
  role: "family" | "carer";
  startDate: string;
  endDate: string;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Time-gated join control for a family/carer video interview (Whereby).
 * Renders nothing until a room is resolved (the GET endpoint returns 403 when
 * the INTERVIEWS_VIDEO_ENABLED flag is off, so the card stays hidden).
 *
 *   >10 min before start → "Room ready, opens at HH:MM" (disabled)
 *   within 10 min        → "Join interview" → opens role URL in a new tab
 *   after endDate        → "Interview ended" (disabled)
 *
 * The role-appropriate URL is decided server-side; this component only opens
 * whatever `roomUrl` it is given.
 */
export default function JoinInterviewCard({
  interviewId,
  scheduledStartAt,
}: {
  interviewId: string;
  scheduledStartAt: string;
}) {
  const [room, setRoom] = useState<RoomResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      // POST is idempotent — creates the room or returns the existing one.
      const res = await fetch(`/api/m/interviews/${interviewId}/room`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        setRoom((await res.json()) as RoomResponse);
      }
    } catch {
      // leave room null; card stays hidden
    } finally {
      setLoaded(true);
    }
  }, [interviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tick once a minute so the gate re-evaluates without a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!loaded || !room) return null;

  const startMs = new Date(room.startDate || scheduledStartAt).getTime();
  const endMs = new Date(room.endDate).getTime();
  const opensSoon = now >= startMs - JOIN_WINDOW_MS;
  const ended = now > endMs;

  return (
    <Card>
      <p className="text-[14px] font-bold text-heading mb-1">Video interview</p>
      <p className="text-[12px] text-subheading mb-3 leading-relaxed">
        {room.role === "family"
          ? "You'll host this interview."
          : "You'll join this interview with the family."}
      </p>

      {ended ? (
        <Button block disabled>
          Interview ended
        </Button>
      ) : opensSoon ? (
        <Button
          block
          onClick={() => window.open(room.roomUrl, "_blank", "noopener")}
        >
          Join interview
        </Button>
      ) : (
        <Button block disabled>
          Room ready, opens at {formatTime(room.startDate || scheduledStartAt)}
        </Button>
      )}
    </Card>
  );
}
