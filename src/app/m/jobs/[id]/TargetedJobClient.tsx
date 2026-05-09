"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  IconClock,
  IconPin,
  Tag,
} from "../../_components/ui";
import { serviceLabel } from "@/lib/care/services";

type Booking = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  service_type: string;
  location_city: string | null;
  location_country: string | null;
  location_postcode_partial: string | null;
  notes: string | null;
  discovery_expires_at: string | null;
  accepted_at: string | null;
};

function fmtRate(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(0)}/hr`;
}

function fmtTotal(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtRange(startsIso: string, endsIso: string): string {
  const s = new Date(startsIso);
  const e = new Date(endsIso);
  const date = s.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${date} · ${t(s)}–${t(e)}`;
}

export default function TargetedJobClient({
  booking,
  seekerId,
  clientFirstName,
  initialPreferred,
  servicePoint,
  mapboxToken,
  mapStyle,
}: {
  booking: Booking;
  seekerId: string;
  clientFirstName: string;
  initialPreferred: boolean;
  servicePoint: { lng: number; lat: number } | null;
  mapboxToken: string;
  mapStyle: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(booking.status);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preferred, setPreferred] = useState(initialPreferred);
  const [, setTick] = useState(0);

  // Per-second tick for the countdown.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const expiresAt = booking.discovery_expires_at;
  const expiredMs = expiresAt
    ? new Date(expiresAt).getTime() - Date.now()
    : null;
  const isExpired = expiredMs != null && expiredMs <= 0;

  async function callAction(action: "accept" | "decline") {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
      };
      if (!res.ok) {
        setErr(json.error ?? "Couldn't update.");
        return;
      }
      if (action === "decline") {
        router.push("/m/jobs");
        return;
      }
      setStatus(json.status ?? "accepted");
      router.refresh();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function togglePreferred() {
    const next = !preferred;
    setPreferred(next);
    try {
      const res = await fetch(`/api/m/preferred-clients/${seekerId}`, {
        method: "POST",
      });
      if (!res.ok) setPreferred(!next);
    } catch {
      setPreferred(!next);
    }
  }

  const subtotalCents = Math.round(
    booking.hours * booking.hourly_rate_cents,
  );

  return (
    <div className="px-5 pt-3 space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Avatar name={clientFirstName.slice(0, 1).toUpperCase()} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[16px] font-bold text-heading truncate">
                {clientFirstName}
              </p>
              <Tag tone="primary">Sent to you</Tag>
              {preferred && <Tag tone="green">Preferred</Tag>}
            </div>
            <p className="mt-0.5 text-[13px] text-subheading">
              {serviceLabel(booking.service_type)} · {booking.hours} hr
            </p>
          </div>
          <button
            type="button"
            onClick={togglePreferred}
            aria-label={
              preferred ? "Remove from preferred clients" : "Add to preferred clients"
            }
            className="grid h-10 w-10 place-items-center rounded-full bg-muted"
          >
            <HeartIcon filled={preferred} />
          </button>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <Row icon={<IconClock />} label="When" value={fmtRange(booking.starts_at, booking.ends_at)} />
        <Row
          icon={<IconPin />}
          label="Where"
          value={
            [
              booking.location_city,
              booking.location_postcode_partial,
              booking.location_country,
            ]
              .filter(Boolean)
              .join(" · ") || "Address shared on accept"
          }
        />
        <Row
          icon={<span className="text-primary">£</span>}
          label="Pay"
          value={`${booking.hours} hr × ${fmtRate(booking.hourly_rate_cents, booking.currency)} = ${fmtTotal(subtotalCents, booking.currency)} subtotal`}
        />
        {booking.notes && (
          <div className="pt-2 border-t border-line">
            <p className="text-[12px] font-semibold text-heading">Notes</p>
            <p className="text-[13px] text-subheading whitespace-pre-wrap mt-1">
              {booking.notes}
            </p>
          </div>
        )}
      </Card>

      {servicePoint && mapboxToken && (
        <SmallMap
          lng={servicePoint.lng}
          lat={servicePoint.lat}
          token={mapboxToken}
          style={mapStyle}
        />
      )}

      <div className="space-y-2">
        {status === "pending" && expiresAt && (
          <div className="text-center text-[13px]">
            <CountdownLabel
              isoExpiresAt={expiresAt}
              isExpired={isExpired}
            />
          </div>
        )}
        {status === "pending" ? (
          <>
            <Button
              block
              onClick={() => callAction("accept")}
              disabled={busy != null || isExpired}
            >
              {isExpired
                ? "Expired"
                : busy === "accept"
                  ? "Accepting…"
                  : "Accept job"}
            </Button>
            <Button
              variant="outline"
              block
              onClick={() => callAction("decline")}
              disabled={busy != null}
            >
              {busy === "decline" ? "Declining…" : "Decline"}
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-card bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-[13px]">
              You&rsquo;ve accepted this job.
              {booking.accepted_at && (
                <span className="block text-[11px] text-emerald-700 mt-0.5">
                  Accepted{" "}
                  {new Date(booking.accepted_at).toLocaleString("en-GB")}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              block
              onClick={() => callAction("decline")}
              disabled={busy != null}
            >
              {busy === "decline" ? "Cancelling…" : "Decline / Cancel"}
            </Button>
          </>
        )}
        {err && <p className="text-center text-[12px] text-rose-700">{err}</p>}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-muted text-heading">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-subheading">
          {label}
        </p>
        <p className="text-[14px] text-heading">{value}</p>
      </div>
    </div>
  );
}

function CountdownLabel({
  isoExpiresAt,
  isExpired,
}: {
  isoExpiresAt: string;
  isExpired: boolean;
}) {
  if (isExpired) {
    return <span className="font-semibold text-rose-700">Job expired</span>;
  }
  const ms = new Date(isoExpiresAt).getTime() - Date.now();
  const totalS = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return (
      <span className="font-semibold text-heading">
        Expires in {h}h {mm}m
      </span>
    );
  }
  return (
    <span
      className={`font-semibold ${m < 2 ? "text-rose-700" : "text-heading"}`}
    >
      Expires in {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function SmallMap({
  lng,
  lat,
  token,
  style,
}: {
  lng: number;
  lat: number;
  token: string;
  style: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !ref.current) return;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: ref.current,
        style,
        center: [lng, lat],
        zoom: 13,
        interactive: false,
      });
      const el = document.createElement("div");
      el.style.cssText =
        "width:24px;height:24px;border-radius:50%;background:#039EA0;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);";
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
      cleanup = () => {
        marker.remove();
        map.remove();
      };
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [lng, lat, token, style]);
  return (
    <div
      ref={ref}
      className="w-full rounded-2xl overflow-hidden border border-line bg-slate-100"
      style={{ height: 180 }}
    />
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "#E11D48" : "none"}
      stroke={filled ? "#E11D48" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
