"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Card,
  Button,
  Tag,
  IconMapPin,
  IconClock,
  IconChat,
} from "../../_components/ui";
import type { CarerPosition } from "@/lib/tracking/types";
import { POSITION_STALE_AFTER_MS } from "@/lib/tracking/types";
import JobActivityPanel from "./_components/JobActivityPanel";
import SosButton from "./_components/SosButton";
import BookingPreferencesPanel from "./_components/BookingPreferencesPanel";
import EtaCard from "./_components/EtaCard";
import ContactBar from "./_components/ContactBar";
import PhotoConsentToggle from "./_components/PhotoConsentToggle";

type Props = {
  bookingId: string;
  role: "seeker" | "caregiver";
  bookingStatus: string;
  initialPosition: CarerPosition | null;
  mapboxToken: string;
  mapStyle: string;
  locationCity: string | null;
  locationCountry: string | null;
  preferences: Record<string, unknown> | null;
  actualStartedAt: string | null;
  completedAt: string | null;
  photoConsent: boolean | null;
  hasArrivalSelfie: boolean;
};

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function checkInLabel(
  bookingStatus: string,
  actualStartedAt: string | null,
  completedAt: string | null,
): { tone: "neutral" | "amber" | "green"; label: string } {
  if (bookingStatus === "completed" || bookingStatus === "paid_out") {
    if (completedAt) {
      return { tone: "green", label: `Checked out ${formatHHMM(completedAt)}` };
    }
    return { tone: "green", label: "Checked out" };
  }
  if (actualStartedAt) {
    return {
      tone: "green",
      label: `Checked in ${formatHHMM(actualStartedAt)}`,
    };
  }
  return { tone: "amber", label: "Not arrived" };
}

const REFRESH_MS = 6_000;

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 15_000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 60 * 60 * 1000) return `${Math.round(ms / 60_000)} min ago`;
  return "a while ago";
}

export default function TrackClient(props: Props) {
  const {
    bookingId,
    role,
    bookingStatus,
    initialPosition,
    mapboxToken,
    mapStyle,
    preferences,
    actualStartedAt,
    completedAt,
    photoConsent,
  } = props;
  const checkIn = checkInLabel(bookingStatus, actualStartedAt, completedAt);
  // Show ETA only to seekers/family before the carer has checked in.
  // Once `in_progress` we replace it with an "Arrived at" line.
  const showEta = role !== "caregiver" && !actualStartedAt;

  const [position, setPosition] = useState<CarerPosition | null>(
    initialPosition,
  );
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  type MapHandle = {
    map: import("mapbox-gl").Map;
    marker: import("mapbox-gl").Marker;
  };
  const mapRef = useRef<MapHandle | null>(null);

  // Initialise Mapbox GL on mount (client only).
  useEffect(() => {
    if (!mapboxToken || !containerRef.current) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = mapboxToken;
      const center: [number, number] = position
        ? [position.lng, position.lat]
        : [-0.1276, 51.5074]; // London fallback
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: mapStyle,
        center,
        zoom: position ? 14 : 11,
        attributionControl: true,
      });
      const el = document.createElement("div");
      el.style.cssText =
        "width:32px;height:32px;border-radius:50%;background:#039EA0;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);";
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(center)
        .addTo(map);

      mapRef.current = { map, marker };
      cleanup = () => map.remove();
    })().catch((err) => {
      console.error("[track] map init failed", err);
      setError("Map couldn't load. Showing latest known location only.");
    });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
      mapRef.current = null;
    };
    // We only want to mount once; refresh ticks update the marker via a
    // separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken, mapStyle]);

  // Update marker when position changes.
  useEffect(() => {
    if (!mapRef.current || !position) return;
    const { map, marker } = mapRef.current;
    marker.setLngLat([position.lng, position.lat]);
    map.easeTo({ center: [position.lng, position.lat], duration: 800 });
  }, [position]);

  // Poll latest position.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/tracking/${bookingId}/latest`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          position: CarerPosition | null;
          eligibility: { eligible: boolean; reason?: string };
        };
        if (cancelled) return;
        if (!json.eligibility.eligible) {
          setError(json.eligibility.reason ?? "Tracking turned off.");
          setPosition(null);
          return;
        }
        setError(null);
        setPosition(json.position);
        if (json.position) {
          const ageMs =
            Date.now() - new Date(json.position.recordedAt).getTime();
          setStale(ageMs > POSITION_STALE_AFTER_MS / 2);
        }
      } catch {
        // network blip; ignore.
      }
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bookingId]);

  // Tick "Updated …s ago" UI even when no new position has arrived.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4 px-4 pt-4 pb-6">
      {/* Map */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-100 border border-line">
        <div
          ref={containerRef}
          className="w-full"
          style={{ height: "55vh", minHeight: 320 }}
          aria-label="Live tracking map"
        />
        {!mapboxToken && (
          <div className="absolute inset-0 grid place-items-center bg-slate-100 text-center px-6">
            <div>
              <p className="text-[14px] font-semibold text-heading">
                Map not configured
              </p>
              <p className="text-[12px] text-subhead mt-1">
                The administrator hasn&apos;t added a map provider yet.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ETA card — seeker/family only, hidden once carer has checked in */}
      {showEta && <EtaCard bookingId={bookingId} />}

      {/* Status card */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span
            className="grid h-10 w-10 flex-none place-items-center rounded-full text-primary"
            style={{ background: "rgba(3,158,160,0.15)" }}
            aria-hidden
          >
            <IconMapPin />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
                {role === "caregiver" ? "Your location" : "Carer location"}
              </p>
              <Tag tone={checkIn.tone}>{checkIn.label}</Tag>
            </div>
            {position ? (
              <p className="text-[15px] font-bold text-heading">
                Updated {formatRelative(position.recordedAt)}
                {stale && (
                  <span className="ml-2 align-middle">
                    <Tag tone="amber">Stale</Tag>
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[15px] font-bold text-heading">
                Waiting for first location…
              </p>
            )}
            <p className="mt-1 text-[12px] text-subhead">
              Booking is{" "}
              <strong className="text-heading">
                {bookingStatus === "paid"
                  ? "confirmed and paid — carer can share location"
                  : bookingStatus === "in_progress"
                    ? "in progress"
                    : bookingStatus}
              </strong>
              .
            </p>
          </div>
        </div>
        {error && (
          <p className="mt-3 text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </Card>

      {/* Contact bar — seeker / family only */}
      {role !== "caregiver" && (
        <ContactBar bookingId={bookingId} role={role} />
      )}

      {/* Photo updates consent — seeker only */}
      {role === "seeker" && photoConsent != null && (
        <PhotoConsentToggle bookingId={bookingId} initial={photoConsent} />
      )}

      {/* Actions */}
      {role === "caregiver" ? (
        <Link href={`/m/track/${bookingId}/share`} className="block">
          <Button block>
            {position ? "Continue sharing" : "Start sharing my location"}
          </Button>
        </Link>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-primary mt-0.5"><IconClock /></span>
            <p className="text-[13px] text-subhead leading-relaxed">
              Locations refresh roughly every 10 seconds while the carer is on
              the way. We never share location after the booking ends.
            </p>
          </div>
          <Link href={`/m/chat`} className="block">
            <Button variant="outline" block>
              <span className="inline-flex items-center gap-2">
                <IconChat /> Message the carer
              </span>
            </Button>
          </Link>
        </Card>
      )}

      {/* Family-supplied match preferences (read-only) */}
      <BookingPreferencesPanel preferences={preferences} role={role} />

      {/* Active-job checklist + quick-log + feed (both roles) */}
      <JobActivityPanel
        bookingId={bookingId}
        role={role}
        photoConsent={photoConsent}
      />

      <p className="text-center text-[11px] text-subhead">
        Booking #{bookingId.slice(0, 8)}
      </p>

      {/* Floating SOS — both roles, fixed bottom-right */}
      <SosButton bookingId={bookingId} />
    </div>
  );
}
