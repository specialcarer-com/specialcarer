"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  IconClock,
  IconPin,
  Tag,
} from "../../../_components/ui";
import { serviceLabel } from "@/lib/care/services";
import JobDetailExtras from "../../_components/JobDetailExtras";

type Request = {
  id: string;
  service_type: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  location_city: string | null;
  location_country: string | null;
  notes: string | null;
  status: string;
  expires_at: string;
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

export default function OpenJobClient({
  request,
  anonClientName,
}: {
  request: Request;
  anonClientName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const expiresMs = new Date(request.expires_at).getTime() - Date.now();
  const isExpired =
    expiresMs <= 0 ||
    (request.status !== "open" && request.status !== "claimed");

  async function claim() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/service-requests/${request.id}/claim`,
        { method: "POST" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        booking_id?: string;
        error?: string;
      };
      if (!res.ok || !json.booking_id) {
        setErr(prettyError(json.error));
        return;
      }
      router.push(`/m/jobs/${json.booking_id}`);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const subtotalCents = Math.round(
    request.hours * request.hourly_rate_cents,
  );

  return (
    <div className="px-5 pt-3 space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Avatar name={anonClientName.slice(0, 1).toUpperCase()} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[16px] font-bold text-heading truncate">
                {anonClientName}
              </p>
              <Tag tone="neutral">Open request</Tag>
            </div>
            <p className="mt-0.5 text-[13px] text-subheading">
              {serviceLabel(request.service_type)} · {request.hours} hr
            </p>
            <p className="mt-0.5 text-[12px] text-subheading">
              Client name shown in full once you&rsquo;ve claimed.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <Row icon={<IconClock />} label="When" value={fmtRange(request.starts_at, request.ends_at)} />
        <Row
          icon={<IconPin />}
          label="Where"
          value={
            [request.location_city, request.location_country]
              .filter(Boolean)
              .join(" · ") || "Address shared on claim"
          }
        />
        <Row
          icon={<span className="text-primary">£</span>}
          label="Pay"
          value={`${request.hours} hr × ${fmtRate(request.hourly_rate_cents, request.currency)} = ${fmtTotal(subtotalCents, request.currency)} subtotal`}
        />
        {request.notes && (
          <div className="pt-2 border-t border-line">
            <p className="text-[12px] font-semibold text-heading">Notes</p>
            <p className="text-[13px] text-subheading whitespace-pre-wrap mt-1">
              {request.notes}
            </p>
          </div>
        )}
      </Card>

      {/* About this client + pay breakdown */}
      <JobDetailExtras jobId={request.id} kind="open" />

      <div className="space-y-2">
        <div className="text-center text-[13px]">
          <Countdown
            isoExpiresAt={request.expires_at}
            isExpired={isExpired}
          />
        </div>
        <Button
          block
          onClick={claim}
          disabled={busy || isExpired || request.status !== "open"}
        >
          {request.status !== "open"
            ? "No longer available"
            : isExpired
              ? "Expired"
              : busy
                ? "Claiming…"
                : "Claim this job"}
        </Button>
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

function Countdown({
  isoExpiresAt,
  isExpired,
}: {
  isoExpiresAt: string;
  isExpired: boolean;
}) {
  if (isExpired) {
    return <span className="font-semibold text-rose-700">Expired</span>;
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
        Closes in {h}h {mm}m
      </span>
    );
  }
  return (
    <span
      className={`font-semibold ${m < 5 ? "text-rose-700" : "text-heading"}`}
    >
      Closes in {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function prettyError(code: string | undefined): string {
  switch (code) {
    case "already_claimed_or_cancelled":
      return "Another carer just claimed this job.";
    case "expired":
      return "This job has expired.";
    case "cannot_claim_own_request":
      return "You can't claim your own request.";
    default:
      return "Couldn't claim this job.";
  }
}
