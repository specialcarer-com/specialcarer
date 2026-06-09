"use client";

/**
 * Go online / go offline control for the carer dashboard (gap 18).
 *
 * A big toggle that flips the carer's "Available now" presence via
 * POST /api/m/me/online-status. When online, a teal banner + travel-radius
 * slider show; when offline, we surface the last time they were online.
 *
 * Sends a lightweight heartbeat every few minutes while online so the
 * 30-min server-side staleness cutoff doesn't drop a carer who left the
 * tab open, and flips to offline on tab close (best-effort beforeunload).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Toggle } from "../_components/ui";

const TEAL = "#039EA0";
const HEARTBEAT_MS = 5 * 60 * 1000; // refresh last_online_at well inside the 30-min cutoff

type Status = {
  is_online: boolean;
  last_online_at: string | null;
  online_radius_km: number;
};

function fmtLastOnline(iso: string | null): string {
  if (!iso) return "Not online yet";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Not online yet";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "Last online just now";
  if (mins < 60) return `Last online ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Last online ${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `Last online ${days} day${days === 1 ? "" : "s"} ago`;
}

export default function GoOnlineCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [radius, setRadius] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const post = useCallback(
    async (online: boolean, radiusKm?: number): Promise<Status | null> => {
      const res = await fetch("/api/m/me/online-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          radiusKm == null ? { online } : { online, radius_km: radiusKm },
        ),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { status: Status };
      return j.status;
    },
    [],
  );

  // Initial load of current presence.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/me/online-status", {
          cache: "no-store",
        });
        if (!res.ok) return; // 404 = not a carer; just hide gracefully
        const j = (await res.json()) as { status: Status };
        if (cancelled) return;
        setStatus(j.status);
        setRadius(j.status.online_radius_km || 5);
      } catch {
        /* leave hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Heartbeat + best-effort offline on unload while online.
  useEffect(() => {
    const online = status?.is_online === true;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (!online) return;

    heartbeatRef.current = setInterval(() => {
      // Re-asserting online refreshes last_online_at server-side.
      void post(true).catch(() => {});
    }, HEARTBEAT_MS);

    const goOffline = () => {
      // sendBeacon survives page unload where fetch may be cancelled.
      try {
        navigator.sendBeacon?.(
          "/api/m/me/online-status",
          new Blob([JSON.stringify({ online: false })], {
            type: "application/json",
          }),
        );
      } catch {
        /* best effort */
      }
    };
    window.addEventListener("beforeunload", goOffline);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      window.removeEventListener("beforeunload", goOffline);
    };
  }, [status?.is_online, post]);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const updated = await post(next, next ? radius : undefined);
        if (updated) {
          setStatus(updated);
          setRadius(updated.online_radius_km || radius);
        }
      } catch {
        setError("Couldn't update your status. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, post, radius],
  );

  // Persist a radius change (debounced on pointer release) only while online.
  const onRadiusCommit = useCallback(
    async (km: number) => {
      if (!status?.is_online) return;
      try {
        const updated = await post(true, km);
        if (updated) setStatus(updated);
      } catch {
        /* keep local value */
      }
    },
    [post, status?.is_online],
  );

  // Not a carer / failed to load → render nothing.
  if (status === null) return null;

  const online = status.is_online;

  return (
    <div className="px-4 pt-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: online ? TEAL : "#9CA3AF" }}
            />
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-heading">
                {online ? "You're online" : "Go online"}
              </p>
              <p className="text-[12px] text-subheading truncate">
                {online
                  ? "Families can find and book you now"
                  : fmtLastOnline(status.last_online_at)}
              </p>
            </div>
          </div>
          <Toggle
            checked={online}
            onChange={onToggle}
            label={online ? "Go offline" : "Go online"}
          />
        </div>

        {online && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <label
                htmlFor="online-radius"
                className="text-[13px] font-semibold text-heading"
              >
                Travel radius
              </label>
              <span className="text-[13px] font-bold" style={{ color: TEAL }}>
                {radius} km
              </span>
            </div>
            <input
              id="online-radius"
              type="range"
              min={1}
              max={20}
              step={1}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              onPointerUp={() => onRadiusCommit(radius)}
              onKeyUp={() => onRadiusCommit(radius)}
              className="mt-2 w-full"
              style={{ accentColor: TEAL }}
            />
            <p className="mt-1 text-[11px] text-subheading">
              We&apos;ll only offer you jobs within this distance.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-2 text-[12px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
