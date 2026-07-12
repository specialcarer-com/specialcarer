"use client";

/**
 * Carer GPS clock-in / clock-out card (Sprint 4.5 v2).
 *
 * Self-contained: reads its own state from /api/bookings/[id]/events, so it can
 * be dropped onto the active-job screen.
 *
 *   • "Clock in"  — shown until a clock_in event exists. Requires a GPS fix AND
 *     a selfie: after the fix resolves we open the camera, capture a photo,
 *     upload it to the private visit-photos bucket, then POST the clock event
 *     with the photo path. The server HARD-blocks clock-in beyond 50 m of the
 *     client address (409 geofence_failed). Photo MATCH is advisory/deferred.
 *   • "Clock out" — shown once clocked in, until a clock_out event exists.
 *     GPS only; no photo, no geofence.
 *
 * A location fix is REQUIRED — permission-denied blocks the action. A photo is
 * required at capture (camera-denied blocks); if the camera is unavailable the
 * carer may skip (flagged for ops review), and an upload failure falls back to
 * an ops-flagged event.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "../../../_components/ui";
import PhotoCapture, { type PhotoResult } from "./PhotoCapture";

const VISIT_PHOTO_BUCKET = "visit-photos";

type ClockEventType = "clock_in" | "clock_out";
type CarerPhotoStatus = "pending" | "skipped" | "error";

type VisitEvent = {
  id: string;
  event_type: ClockEventType;
  event_at: string;
};

type GeoOutcome =
  | { ok: true; coords: GeolocationCoordinates }
  | { ok: false; reason: "denied" | "timeout" | "unavailable" };

function requestPosition(): Promise<GeoOutcome> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, reason: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, coords: pos.coords }),
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable";
        resolve({ ok: false, reason });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PendingCapture = { coords: GeolocationCoordinates };

export default function GpsClockCard({ bookingId }: { bookingId: string }) {
  const [events, setEvents] = useState<VisitEvent[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<ClockEventType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Non-null while the camera overlay is open, holding the GPS fix taken just
  // before capture so we can POST both together once the photo is ready.
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/events`, {
        cache: "no-store",
      });
      if (!res.ok) {
        // Distinguish "failed to load" from "no events yet": leaving events as
        // null and flagging the failure prevents showing "Clock in" (and risking
        // a double-clock) when we simply couldn't read the current state.
        setLoadFailed(true);
        return;
      }
      const json = (await res.json()) as { events?: VisitEvent[] };
      setEvents(json.events ?? []);
    } catch {
      setLoadFailed(true);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const clockIn = events?.find((e) => e.event_type === "clock_in") ?? null;
  const clockOut = events?.find((e) => e.event_type === "clock_out") ?? null;

  async function getFix(
    eventType: ClockEventType,
  ): Promise<GeolocationCoordinates | null> {
    const geo = await requestPosition();
    if (geo.ok) return geo.coords;
    if (geo.reason === "denied" || geo.reason === "unavailable") {
      setError(
        `GPS permission required to clock ${eventType === "clock_in" ? "in" : "out"}. Enable location for Special Carer in device settings.`,
      );
    } else {
      setError("Couldn't get a GPS fix in time. Please try again.");
    }
    return null;
  }

  // Clock-in: fix → open camera. The POST happens in onCaptureResult once the
  // photo is captured/skipped so location and selfie land together.
  async function startClockIn() {
    setBusy("clock_in");
    setError(null);
    setFlash(null);
    const coords = await getFix("clock_in");
    if (!coords) {
      setBusy(null);
      return;
    }
    setPendingCapture({ coords });
  }

  // Clock-out: fix → POST (no photo, no geofence).
  async function doClockOut() {
    setBusy("clock_out");
    setError(null);
    setFlash(null);
    const coords = await getFix("clock_out");
    if (!coords) {
      setBusy(null);
      return;
    }
    await submitClock("clock_out", coords, {});
    setBusy(null);
  }

  async function onCaptureResult(result: PhotoResult) {
    const pending = pendingCapture;
    setPendingCapture(null);
    if (!pending) {
      setBusy(null);
      return;
    }
    const coords = pending.coords;

    if (result.kind === "cancelled") {
      setBusy(null);
      return;
    }
    if (result.kind === "denied") {
      setError(
        "Camera access required — enable it in device settings to clock in.",
      );
      setBusy(null);
      return;
    }
    if (result.kind === "skipped") {
      await submitClock("clock_in", coords, {
        photoStatus: "skipped",
        verificationNote: "camera unavailable",
        flaggedNote: "Photo skipped — this shift is flagged for ops review.",
      });
      setBusy(null);
      return;
    }

    // Captured: upload to storage, then POST with the photo path. On upload
    // failure retry once, then proceed with an ops-flagged error status.
    const eventId = crypto.randomUUID();
    const upload = await uploadPhoto(eventId, result.blob);
    if (upload.ok) {
      await submitClock("clock_in", coords, {
        eventId,
        photoUrl: upload.path,
        photoStatus: "pending",
      });
    } else {
      await submitClock("clock_in", coords, {
        eventId,
        photoStatus: "error",
        verificationNote: "upload failed",
        flaggedNote:
          "Photo upload failed — clocked in, but the shift is flagged for ops review.",
      });
    }
    setBusy(null);
  }

  async function uploadPhoto(
    eventId: string,
    blob: Blob,
  ): Promise<{ ok: true; path: string } | { ok: false }> {
    const supabase = createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return { ok: false };
    const path = `${user.id}/${bookingId}/${eventId}.jpg`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: upErr } = await supabase.storage
        .from(VISIT_PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (!upErr) return { ok: true, path };
    }
    return { ok: false };
  }

  async function submitClock(
    eventType: ClockEventType,
    coords: GeolocationCoordinates,
    opts: {
      eventId?: string;
      photoUrl?: string;
      photoStatus?: CarerPhotoStatus;
      verificationNote?: string;
      flaggedNote?: string;
    },
  ) {
    const failCopy =
      eventType === "clock_in"
        ? "Try again — your clock-in has not been recorded."
        : "Try again — your clock-out has not been recorded.";
    try {
      const res = await fetch(`/api/bookings/${bookingId}/clock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy_metres: coords.accuracy,
          client_reported_at: new Date().toISOString(),
          ...(opts.eventId ? { event_id: opts.eventId } : {}),
          ...(opts.photoUrl ? { photo_url: opts.photoUrl } : {}),
          ...(opts.photoStatus
            ? { photo_verification_status: opts.photoStatus }
            : {}),
          ...(opts.verificationNote
            ? { verification_note: opts.verificationNote }
            : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          distance_metres?: number | null;
        };
        if (j.error === "geofence_failed") {
          const dist =
            typeof j.distance_metres === "number"
              ? `${Math.round(j.distance_metres)}m`
              : "too far";
          setError(
            `You appear to be ${dist} from the client's address (must be within 50m). Move closer and try again, or contact ops for an override.`,
          );
        } else {
          setError(j.error === undefined ? failCopy : j.error);
        }
        return;
      }
      setFlash(
        opts.flaggedNote ??
          (eventType === "clock_in"
            ? "Clocked in — the family can see your visit has started."
            : "Clocked out — your visit is recorded."),
      );
      await load();
    } catch {
      setError(failCopy);
    }
  }

  if (loadFailed) {
    return (
      <Card className="p-4 space-y-3">
        <p className="text-[12px] text-[#0F1416] leading-relaxed">
          Couldn&apos;t load your clock status. Check your connection and retry —
          this won&apos;t clock you in or out.
        </p>
        <Button variant="outline" block onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    );
  }

  if (events === null) {
    return (
      <Card className="p-4">
        <p className="text-[12px] text-subheading">Loading clock status…</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="text-[14px] font-bold text-heading">GPS clock-in</p>
        <p className="mt-1 text-[12px] text-subheading">
          Clock in when you arrive and out when you leave. Your location is
          recorded as proof of visit.
        </p>
      </div>

      {clockIn && (
        <p className="text-[13px] text-heading">
          Clocked in at <strong>{fmtTime(clockIn.event_at)}</strong>
          {clockOut && (
            <>
              {" · "}Clocked out at <strong>{fmtTime(clockOut.event_at)}</strong>
            </>
          )}
        </p>
      )}

      {!clockIn && (
        <Button
          block
          onClick={() => void startClockIn()}
          disabled={busy !== null}
        >
          {busy === "clock_in" ? "Clocking in…" : "Clock in"}
        </Button>
      )}

      {clockIn && !clockOut && (
        <Button
          block
          onClick={() => void doClockOut()}
          disabled={busy !== null}
        >
          {busy === "clock_out" ? "Clocking out…" : "Clock out"}
        </Button>
      )}

      {pendingCapture && (
        <PhotoCapture onResult={(r) => void onCaptureResult(r)} />
      )}

      {flash && (
        <p className="rounded-xl bg-primary-50 px-3 py-2 text-[12px] font-semibold text-primary">
          {flash}
        </p>
      )}
      {error && (
        <div className="space-y-2">
          <p className="text-[12px] text-[#0F1416] leading-relaxed">{error}</p>
          <Button
            variant="outline"
            block
            onClick={() =>
              void (clockIn ? doClockOut() : startClockIn())
            }
            disabled={busy !== null}
          >
            Try again
          </Button>
        </div>
      )}
    </Card>
  );
}
