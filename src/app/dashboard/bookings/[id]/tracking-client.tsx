"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Ping = {
  id: number;
  lat: number;
  lng: number;
  recorded_at: string;
  accuracy_m?: number | null;
};

type Session = {
  id: string;
  status: "pending" | "active" | "ended" | "cancelled";
  started_at: string | null;
  ended_at: string | null;
  last_ping_at: string | null;
  tracking_window_end: string;
};

type MapboxConfig = { token: string; style: string; stub: boolean };

type Props = {
  bookingId: string;
  role: "seeker" | "caregiver";
  scheduledStart: string;
  scheduledEnd: string;
  trackingWindowEnd: string;
  initiallyOpen: boolean;
  paid: boolean;
};

const POLL_MS = 10_000;
const PING_MS = 15_000;

export default function BookingTrackingClient(props: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [pings, setPings] = useState<Ping[]>([]);
  const [config, setConfig] = useState<MapboxConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [permission, setPermission] = useState<string>("");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // Use any for mapbox-gl types to avoid pulling SSR-incompatible types into the page bundle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPingTimestampRef = useRef<number>(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch Mapbox config once
  useEffect(() => {
    fetch("/api/mapbox/config")
      .then((r) => r.json())
      .then((c: MapboxConfig) => setConfig(c))
      .catch(() => setConfig({ token: "", style: "", stub: true }));
  }, []);

  // Poll tracking state
  const refresh = useCallback(
    async (since?: string) => {
      const url = since
        ? `/api/shifts/${props.bookingId}/track?since=${encodeURIComponent(since)}`
        : `/api/shifts/${props.bookingId}/track`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        session: Session | null;
        pings: Ping[];
      };
      setSession(data.session);
      if (since) {
        if (data.pings.length > 0) {
          setPings((prev) => [...prev, ...data.pings].slice(-500));
        }
      } else {
        setPings(data.pings);
      }
    },
    [props.bookingId]
  );

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      const lastTime =
        pings.length > 0 ? pings[pings.length - 1].recorded_at : undefined;
      refresh(lastTime);
    }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bookingId]);

  // Initialise Mapbox once we have config + container + at least one ping
  useEffect(() => {
    if (!config || !config.token || !mapContainerRef.current || mapRef.current) {
      return;
    }
    if (pings.length === 0 && !session) return;

    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      // CSS is loaded via the page-level link tag
      if (cancelled) return;
      mapboxgl.accessToken = config.token;
      const center =
        pings.length > 0
          ? [pings[pings.length - 1].lng, pings[pings.length - 1].lat]
          : [-0.1276, 51.5074]; // London fallback
      const map = new mapboxgl.Map({
        container: mapContainerRef.current!,
        style: config.style || "mapbox://styles/mapbox/streets-v12",
        center: center as [number, number],
        zoom: 14,
      });
      mapRef.current = map;
      if (pings.length > 0) {
        const last = pings[pings.length - 1];
        const marker = new mapboxgl.Marker({ color: "#0ea5e9" })
          .setLngLat([last.lng, last.lat])
          .addTo(map);
        markerRef.current = marker;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config, pings, session]);

  // Update marker on new pings
  useEffect(() => {
    if (!mapRef.current || pings.length === 0) return;
    const last = pings[pings.length - 1];
    if (markerRef.current) {
      markerRef.current.setLngLat([last.lng, last.lat]);
    }
    mapRef.current.easeTo({
      center: [last.lng, last.lat],
      duration: 800,
    });
  }, [pings]);

  // -------------------- Caregiver controls --------------------

  const startTracking = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/shifts/${props.bookingId}/tracking/start`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start tracking");
      setSession(data.session);
      // Begin geolocation watch
      if (!("geolocation" in navigator)) {
        throw new Error("Geolocation not supported in this browser");
      }
      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const now = Date.now();
          if (now - lastPingTimestampRef.current < PING_MS) return;
          lastPingTimestampRef.current = now;
          await fetch(`/api/shifts/${props.bookingId}/ping`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: pos.coords.accuracy,
              heading: pos.coords.heading ?? null,
              speed_mps: pos.coords.speed ?? null,
            }),
          }).catch(() => null);
        },
        (err) => {
          setPermission(`Geolocation error: ${err.message}`);
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
      );
      watchIdRef.current = watchId;
      // Heartbeat every PING_MS even if watchPosition is quiet
      pingTimerRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await fetch(`/api/shifts/${props.bookingId}/ping`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy_m: pos.coords.accuracy,
              }),
            }).catch(() => null);
          },
          () => null,
          { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
        );
      }, PING_MS);
      setTracking(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [props.bookingId]);

  const stopTracking = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      const res = await fetch(`/api/shifts/${props.bookingId}/tracking/stop`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not stop tracking");
      setSession(data.session);
      setTracking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [props.bookingId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    };
  }, []);

  // -------------------- Render --------------------

  const isActive = session?.status === "active";
  const isEnded =
    session?.status === "ended" || session?.status === "cancelled";

  return (
    <div className="mt-6">
      {/* Mapbox CSS */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css"
        rel="stylesheet"
      />
      <div className="p-5 rounded-2xl bg-white border border-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Live tracking</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isActive
                ? "bg-emerald-100 text-emerald-700"
                : isEnded
                  ? "bg-slate-100 text-slate-600"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            {session?.status ?? "not started"}
          </span>
        </div>

        {!props.paid && (
          <p className="mt-3 text-sm text-amber-700">
            Tracking unlocks once payment is captured.
          </p>
        )}

        {!props.initiallyOpen && !isActive && props.paid && (
          <p className="mt-3 text-sm text-slate-600">
            Tracking opens 15 minutes before the shift start and closes 15
            minutes after the scheduled end.
          </p>
        )}

        {props.role === "caregiver" && props.paid && (
          <div className="mt-4 flex flex-wrap gap-2">
            {!tracking && !isEnded && (
              <button
                onClick={startTracking}
                disabled={busy || !props.initiallyOpen}
                className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
              >
                {busy ? "Starting…" : "Start sharing my location"}
              </button>
            )}
            {tracking && (
              <button
                onClick={stopTracking}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
              >
                {busy ? "Stopping…" : "Stop sharing"}
              </button>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {permission && (
          <p className="mt-2 text-xs text-slate-500">{permission}</p>
        )}

        <div className="mt-4 rounded-xl overflow-hidden border border-slate-100">
          {config && config.token ? (
            <div
              ref={mapContainerRef}
              className="w-full h-72 bg-slate-50"
              aria-label="Live caregiver location map"
            />
          ) : (
            <div className="w-full h-32 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
              {config?.stub
                ? "Map preview unavailable in stub mode — Mapbox token not set."
                : "Loading map…"}
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {pings.length > 0 ? (
            <>
              {pings.length} location update{pings.length === 1 ? "" : "s"} ·
              latest {new Date(pings[pings.length - 1].recorded_at).toLocaleTimeString()}
            </>
          ) : (
            "No location updates yet."
          )}
        </div>
      </div>
    </div>
  );
}
