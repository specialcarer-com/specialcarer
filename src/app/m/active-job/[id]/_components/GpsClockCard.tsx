"use client";

/**
 * Carer GPS clock-in / clock-out card (Sprint 4.5 scaffold).
 *
 * Self-contained: reads its own state from /api/bookings/[id]/events, so it can
 * be dropped onto the active-job screen without touching the existing
 * selfie + geofence check-in flow.
 *
 *   • "Clock in"  — shown until a clock_in event exists.
 *   • "Clock out" — shown once clocked in, until a clock_out event exists.
 *
 * On tap we request a high-accuracy GPS fix (10s timeout) and POST it to the
 * clock endpoint. A location fix is REQUIRED — self-attesting verification is
 * the whole point, so permission-denied blocks the action rather than falling
 * back to a location-less event.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "../../../_components/ui";

type ClockEventType = "clock_in" | "clock_out";

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

export default function GpsClockCard({ bookingId }: { bookingId: string }) {
  const [events, setEvents] = useState<VisitEvent[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<ClockEventType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  async function doClock(eventType: ClockEventType) {
    setBusy(eventType);
    setError(null);
    setFlash(null);

    const geo = await requestPosition();
    if (!geo.ok) {
      if (geo.reason === "denied" || geo.reason === "unavailable") {
        setError(
          "GPS permission required to clock in. Enable location for Special Carer in device settings.",
        );
      } else {
        setError("Couldn't get a GPS fix in time. Please try again.");
      }
      setBusy(null);
      return;
    }

    try {
      const res = await fetch(`/api/bookings/${bookingId}/clock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          latitude: geo.coords.latitude,
          longitude: geo.coords.longitude,
          accuracy_metres: geo.coords.accuracy,
          client_reported_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          j.error === undefined
            ? "Try again — your clock-in has not been recorded."
            : j.error,
        );
        setBusy(null);
        return;
      }
      setFlash(
        eventType === "clock_in"
          ? "Clocked in — the family can see your visit has started."
          : "Clocked out — your visit is recorded.",
      );
      await load();
    } catch {
      setError("Try again — your clock-in has not been recorded.");
    } finally {
      setBusy(null);
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
          onClick={() => void doClock("clock_in")}
          disabled={busy !== null}
        >
          {busy === "clock_in" ? "Clocking in…" : "Clock in"}
        </Button>
      )}

      {clockIn && !clockOut && (
        <Button
          block
          onClick={() => void doClock("clock_out")}
          disabled={busy !== null}
        >
          {busy === "clock_out" ? "Clocking out…" : "Clock out"}
        </Button>
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
            onClick={() => void doClock(clockIn ? "clock_out" : "clock_in")}
            disabled={busy !== null}
          >
            Try again
          </Button>
        </div>
      )}
    </Card>
  );
}
