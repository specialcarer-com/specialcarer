"use client";

/**
 * Carer-side live shift screen.
 *
 * Three phases driven by booking.status:
 *   • paid|accepted    → CHECK-IN  (selfie + GPS geofence)
 *   • in_progress      → ACTIVE    (timer, checklist, quick-logs, chat, SOS, check-out)
 *   • completed|paid_out → SUMMARY (read-only)
 *
 * All state lives behind the live `/api/m/active-job/[id]` endpoint,
 * which we re-fetch after every mutating action so the UI stays in
 * sync with whatever the server believes.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, Card, IconClock, IconPin, Tag } from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
};

type RecipientFull = {
  id: string;
  kind: "child" | "senior" | "home";
  display_name: string | null;
  date_of_birth: string | null;
  allergies: string[] | null;
  medical_conditions: string[] | null;
  medications: unknown;
  mobility_level: string | null;
  special_needs: string[] | null;
  school: string | null;
  notes: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  has_pets: boolean | null;
  pets_notes: string | null;
  access_instructions: string | null;
};

type JournalRow = {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  photo_urls: string[];
};

type State = {
  booking: {
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
    location_postcode: string | null;
    notes: string | null;
    actual_started_at: string | null;
    shift_completed_at: string | null;
    handoff_notes: string | null;
    arrival_selfie_path: string | null;
    photo_updates_consent: boolean | null;
    seeker_first_name: string;
    seeker_initial: string;
    seeker_phone: string | null;
  };
  recipients_full: RecipientFull[];
  pay_breakdown_live: {
    hours_total: number;
    hours_so_far: number;
    hourly_rate_cents: number;
    subtotal_so_far_cents: number;
    subtotal_total_cents: number;
    earnings_total_cents: number;
    carer_fee_percent: number;
    carer_fee_cents: number;
    currency: string;
  };
  checklist: ChecklistItem[];
  recent_journal: JournalRow[];
  chat_unread_count: number;
  geofence: {
    radius_m: number;
    service_point_lng: number | null;
    service_point_lat: number | null;
  };
};

const QUICK_LOG_KINDS = [
  { kind: "meal", emoji: "🍽", label: "Meal" },
  { kind: "medication", emoji: "💊", label: "Meds" },
  { kind: "nap", emoji: "😴", label: "Nap" },
  { kind: "incident", emoji: "🚨", label: "Incident" },
  { kind: "note", emoji: "📝", label: "Note" },
] as const;

type QuickKind = (typeof QUICK_LOG_KINDS)[number]["kind"];

const PHOTOS_BUCKET = "journal-photos";

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalS = Math.floor(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isCapacitorIOS(): boolean {
  if (typeof window === "undefined") return false;
  type CapacitorWindow = { Capacitor?: { getPlatform?: () => string } };
  const w = window as unknown as CapacitorWindow;
  try {
    return w.Capacitor?.getPlatform?.() === "ios";
  } catch {
    return false;
  }
}

function getCurrentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (p: GeolocationPosition | null) => {
      if (settled) return;
      settled = true;
      resolve(p);
    };
    const t = setTimeout(() => finish(null), 11_000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(t);
        finish(p);
      },
      () => {
        clearTimeout(t);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

export default function ActiveJobClient({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/m/active-job/${bookingId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't load active job.");
        return;
      }
      const json = (await res.json()) as State;
      setState(json);
      setErr(null);
    } catch {
      setErr("Network error.");
    }
  }, [bookingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Per-second tick for the elapsed timer.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (err && !state) {
    return (
      <div className="px-5 pt-6 text-center text-rose-700 text-sm">{err}</div>
    );
  }
  if (!state) {
    return (
      <div className="px-5 pt-6 text-center text-subheading text-sm">
        Loading…
      </div>
    );
  }

  const status = state.booking.status;
  if (status === "paid" || status === "accepted") {
    return (
      <CheckInPhase
        state={state}
        onCheckedIn={refresh}
      />
    );
  }
  if (status === "in_progress") {
    return <ActivePhase state={state} onMutated={refresh} />;
  }
  return <SummaryPhase state={state} />;
}

// ────────────────────────────────────────────────────────────────────
// CHECK-IN PHASE
// ────────────────────────────────────────────────────────────────────

function CheckInPhase({
  state,
  onCheckedIn,
}: {
  state: State;
  onCheckedIn: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"selfie" | "checking" | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  function pickPhoto(f: File) {
    setStagedFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setErr(null);
  }

  async function checkIn() {
    if (!stagedFile) {
      setErr("Take an arrival selfie first.");
      return;
    }
    setBusy("checking");
    setErr(null);
    try {
      // 1. Geolocation.
      const pos = await getCurrentPosition();
      if (!pos) {
        setErr(
          "Location permission required to check in. Open Settings → enable location for SpecialCarer.",
        );
        setBusy(null);
        return;
      }
      // 2. Upload selfie.
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      const userId = u.user?.id;
      if (!userId) {
        setErr("Sign in first.");
        setBusy(null);
        return;
      }
      const ext = (stagedFile.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${userId}/arrival-${state.booking.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from(PHOTOS_BUCKET)
        .upload(path, stagedFile, {
          upsert: true,
          contentType: stagedFile.type || "image/jpeg",
        });
      if (upErr) {
        setErr(upErr.message);
        setBusy(null);
        return;
      }
      // 3. Server check-in.
      const res = await fetch(
        `/api/bookings/${state.booking.id}/check-in`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            selfie_path: path,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        distance_m?: number;
      };
      if (!res.ok) {
        if (typeof json.distance_m === "number") setDistance(json.distance_m);
        setErr(json.error ?? "Couldn't check in.");
        setBusy(null);
        return;
      }
      onCheckedIn();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-5 pt-3 pb-12 space-y-4">
      <ClientHeader state={state} />
      <AddressBlock state={state} />

      <Card className="p-4 space-y-3">
        <div>
          <p className="text-[14px] font-bold text-heading">Arrival check-in</p>
          <p className="mt-1 text-[12px] text-subheading">
            Take a selfie at the door so the family can see you arrived. We
            check your location is within{" "}
            {state.geofence.radius_m} m of the booking address.
          </p>
        </div>

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Arrival selfie preview"
            className="w-full rounded-xl border border-line"
          />
        )}

        <Button
          variant="outline"
          block
          onClick={() => fileRef.current?.click()}
          disabled={busy != null}
        >
          {stagedFile ? "Retake selfie" : "Take arrival selfie"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickPhoto(f);
          }}
        />

        <Button block onClick={checkIn} disabled={busy != null || !stagedFile}>
          {busy === "checking" ? "Checking in…" : "Check in & start shift"}
        </Button>

        {err && (
          <p className="text-[12px] text-rose-700 leading-relaxed">{err}</p>
        )}
        {distance != null && (
          <p className="text-[11px] text-subheading">
            Last reading: {distance} m from the booking address.
          </p>
        )}
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// ACTIVE PHASE
// ────────────────────────────────────────────────────────────────────

function ActivePhase({
  state,
  onMutated,
}: {
  state: State;
  onMutated: () => void;
}) {
  const [quickLogOpen, setQuickLogOpen] = useState<QuickKind | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const startedMs = state.booking.actual_started_at
    ? new Date(state.booking.actual_started_at).getTime()
    : Date.now();
  const elapsed = Date.now() - startedMs;

  const totalShiftMs = state.booking.hours * 3600_000;
  const progressPct = Math.max(
    0,
    Math.min(100, Math.round((elapsed / totalShiftMs) * 100)),
  );

  async function toggleChecklist(itemId: string) {
    const next = state.checklist.map((it) =>
      it.id === itemId
        ? {
            ...it,
            done: !it.done,
            done_at: !it.done ? new Date().toISOString() : null,
          }
        : it,
    );
    try {
      const res = await fetch(
        `/api/bookings/${state.booking.id}/checklist`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: next }),
        },
      );
      if (res.ok) onMutated();
    } catch {
      /* ignore */
    }
  }

  async function uploadPhoto(file: File) {
    if (state.booking.photo_updates_consent === false) return;
    setPhotoBusy(true);
    setPhotoErr(null);
    try {
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      const userId = u.user?.id;
      if (!userId) {
        setPhotoErr("Sign in first.");
        setPhotoBusy(false);
        return;
      }
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${userId}/note-${state.booking.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from(PHOTOS_BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });
      if (upErr) {
        setPhotoErr(upErr.message);
        setPhotoBusy(false);
        return;
      }
      const res = await fetch(
        `/api/m/active-job/${state.booking.id}/quick-log`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "note",
            body: "Photo update from on-shift.",
            photo_path: path,
          }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhotoErr(j.error ?? "Upload failed.");
        return;
      }
      onMutated();
    } catch {
      setPhotoErr("Network error.");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="px-5 pt-3 pb-32 space-y-4">
      <ClientHeader state={state} />
      <AddressBlock state={state} />

      {/* Timer */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-subheading">
              Shift timer
            </p>
            <p className="mt-1 text-[28px] font-extrabold text-heading tabular-nums leading-none">
              {fmtElapsed(elapsed)}
            </p>
            <p className="mt-1 text-[12px] text-subheading">
              {state.pay_breakdown_live.hours_so_far.toFixed(2)} /{" "}
              {state.booking.hours} hr · {progressPct}%
            </p>
          </div>
          <Tag tone="primary">In progress</Tag>
        </div>
        <div className="mt-3 h-2 w-full bg-muted rounded-pill overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-3 text-[12px] text-subheading">
          Earnings on completion:{" "}
          <strong className="text-heading">
            {fmtMoney(
              state.pay_breakdown_live.earnings_total_cents,
              state.booking.currency,
            )}
          </strong>
        </p>
      </Card>

      {/* Recipients (full info now revealed) */}
      {state.recipients_full.length > 0 && (
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
            Care recipients
          </p>
          <ul className="space-y-2">
            {state.recipients_full.map((r) => (
              <li
                key={r.id}
                className="rounded-card border border-line p-3 bg-white"
              >
                <p className="text-[14px] font-semibold text-heading">
                  {r.display_name ??
                    (r.kind === "child"
                      ? "Child"
                      : r.kind === "senior"
                        ? "Senior"
                        : "Home")}
                </p>
                <RecipientDetails r={r} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Checklist */}
      {state.checklist.length > 0 && (
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
            Tasks
          </p>
          <ul className="space-y-2">
            {state.checklist.map((it) => (
              <li key={it.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={() => toggleChecklist(it.id)}
                  className="mt-1 h-5 w-5"
                />
                <span
                  className={`text-[14px] ${
                    it.done ? "line-through text-subheading" : "text-heading"
                  }`}
                >
                  {it.text}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Quick-log row */}
      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
          Quick log
        </p>
        <div className="grid grid-cols-5 gap-2">
          {QUICK_LOG_KINDS.map((q) => (
            <button
              key={q.kind}
              type="button"
              onClick={() => setQuickLogOpen(q.kind)}
              className="flex flex-col items-center gap-1 rounded-card border border-line bg-white p-2 active:scale-95 transition"
            >
              <span className="text-[22px]" aria-hidden>
                {q.emoji}
              </span>
              <span className="text-[11px] font-semibold text-heading">
                {q.label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Photo upload */}
      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
          Photo update
        </p>
        {state.booking.photo_updates_consent === false ? (
          <p className="text-[13px] text-subheading">
            Photo updates are off for this booking.
          </p>
        ) : (
          <>
            <Button
              variant="outline"
              block
              onClick={() => photoRef.current?.click()}
              disabled={photoBusy}
            >
              {photoBusy ? "Uploading…" : "Take a photo update"}
            </Button>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
              }}
            />
            {photoErr && (
              <p className="mt-2 text-[12px] text-rose-700">{photoErr}</p>
            )}
          </>
        )}
      </Card>

      {/* Recent journal */}
      {state.recent_journal.length > 0 && (
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
            Recent activity
          </p>
          <ul className="space-y-2">
            {state.recent_journal.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-2 border-t border-line first:border-t-0 first:pt-0 pt-2"
              >
                <Tag tone="neutral">{e.kind}</Tag>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-heading whitespace-pre-wrap">
                    {e.body}
                  </p>
                  {e.photo_urls.length > 0 && (
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {e.photo_urls.slice(0, 4).map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={u}
                          src={u}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover border border-line"
                        />
                      ))}
                    </div>
                  )}
                  <p className="mt-0.5 text-[11px] text-subheading">
                    {new Date(e.created_at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Message client */}
      <Link href={`/m/chat/${state.booking.id}`}>
        <Button variant="outline" block>
          Message client
          {state.chat_unread_count > 0 ? ` (${state.chat_unread_count})` : ""}
        </Button>
      </Link>

      {/* Check-out CTA */}
      <CheckOutCTA bookingId={state.booking.id} onDone={onMutated} />

      {/* Sticky SOS */}
      <ActiveSosButton bookingId={state.booking.id} />

      {quickLogOpen && (
        <QuickLogModal
          bookingId={state.booking.id}
          kind={quickLogOpen}
          photoConsent={state.booking.photo_updates_consent !== false}
          onClose={() => setQuickLogOpen(null)}
          onPosted={() => {
            setQuickLogOpen(null);
            onMutated();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// SUMMARY PHASE (read-only)
// ────────────────────────────────────────────────────────────────────

function SummaryPhase({ state }: { state: State }) {
  const startedMs = state.booking.actual_started_at
    ? new Date(state.booking.actual_started_at).getTime()
    : null;
  const completedMs = state.booking.shift_completed_at
    ? new Date(state.booking.shift_completed_at).getTime()
    : null;
  const elapsed =
    startedMs && completedMs
      ? completedMs - startedMs
      : 0;
  return (
    <div className="px-5 pt-3 pb-12 space-y-4">
      <ClientHeader state={state} />
      <Card className="p-4 text-center">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          Shift complete
        </p>
        <p className="mt-2 text-[26px] font-extrabold text-heading tabular-nums">
          {fmtElapsed(elapsed)}
        </p>
        <p className="mt-1 text-[12px] text-subheading">
          Earnings:{" "}
          <strong className="text-heading">
            {fmtMoney(
              state.pay_breakdown_live.earnings_total_cents,
              state.booking.currency,
            )}
          </strong>{" "}
          · paid 24 h after shift ends
        </p>
      </Card>
      {state.booking.handoff_notes && (
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-subheading mb-1">
            Your handoff notes
          </p>
          <p className="text-[13px] text-heading whitespace-pre-wrap">
            {state.booking.handoff_notes}
          </p>
        </Card>
      )}
      <Link href={`/m/jobs/${state.booking.id}`}>
        <Button variant="outline" block>
          Back to job details
        </Button>
      </Link>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Shared sub-components
// ────────────────────────────────────────────────────────────────────

function ClientHeader({ state }: { state: State }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar name={state.booking.seeker_initial} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-heading truncate">
            {state.booking.seeker_first_name}
          </p>
          <p className="text-[12px] text-subheading">
            {state.booking.service_type.replace(/_/g, " ")} · {state.booking.hours} hr
          </p>
        </div>
      </div>
    </Card>
  );
}

function AddressBlock({ state }: { state: State }) {
  // Find a recipient with a real address line.
  const recWithAddr = state.recipients_full.find(
    (r) => r.address_line1 && r.address_line1.trim().length > 0,
  );
  const lines = [
    recWithAddr?.address_line1,
    recWithAddr?.address_line2,
    recWithAddr?.city ?? state.booking.location_city,
    recWithAddr?.postcode ?? state.booking.location_postcode,
  ].filter((s): s is string => !!s && s.trim().length > 0);

  const lat = state.geofence.service_point_lat;
  const lng = state.geofence.service_point_lng;
  const navHref = (() => {
    if (lat == null || lng == null) return null;
    return isCapacitorIOS()
      ? `https://maps.apple.com/?daddr=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  })();

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-muted text-heading">
          <IconPin />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-subheading">
            Address
          </p>
          {lines.length > 0 ? (
            <p className="text-[14px] text-heading whitespace-pre-line">
              {lines.join("\n")}
            </p>
          ) : (
            <p className="text-[13px] text-subheading">
              Address shared on accept.
            </p>
          )}
          {recWithAddr?.access_instructions && (
            <p className="mt-1 text-[12px] text-subheading whitespace-pre-wrap">
              {recWithAddr.access_instructions}
            </p>
          )}
        </div>
        {navHref && (
          <a
            href={navHref}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-semibold text-primary self-center"
          >
            Navigate →
          </a>
        )}
      </div>
    </Card>
  );
}

function RecipientDetails({ r }: { r: RecipientFull }) {
  const bits: string[] = [];
  if (r.kind === "child" && r.date_of_birth) {
    const age = Math.max(
      0,
      Math.floor(
        (Date.now() - Date.parse(r.date_of_birth)) /
          (365.25 * 24 * 3600 * 1000),
      ),
    );
    if (Number.isFinite(age)) bits.push(`${age}yo`);
  }
  if (r.kind === "senior" && r.mobility_level)
    bits.push(`Mobility: ${r.mobility_level}`);
  const allergies = (r.allergies ?? []).filter((s) => s.trim());
  if (allergies.length > 0) bits.push(`Allergies: ${allergies.join(", ")}`);
  const cond = (r.medical_conditions ?? []).filter((s) => s.trim());
  if (cond.length > 0) bits.push(`Conditions: ${cond.join(", ")}`);
  const sn = (r.special_needs ?? []).filter((s) => s.trim());
  if (sn.length > 0) bits.push(`Needs: ${sn.join(", ")}`);
  if (r.has_pets) bits.push(r.pets_notes ? `Pets: ${r.pets_notes}` : "Has pets");
  if (bits.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {bits.map((b, i) => (
        <li key={i} className="text-[12px] text-subheading">
          {b}
        </li>
      ))}
    </ul>
  );
}

function CheckOutCTA({
  bookingId,
  onDone,
}: {
  bookingId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          handoff_notes: notes.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setErr(json.error ?? "Couldn't check out.");
        return;
      }
      setOpen(false);
      onDone();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        block
        onClick={() => setOpen(true)}
        className="bg-primary"
      >
        Check out &amp; finish
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 grid items-end"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-bold text-heading">
              Check out &amp; finish
            </h3>
            <p className="mt-1 text-[13px] text-subheading leading-relaxed">
              Add a brief handoff for the family — anything they should know.
              Optional. You&rsquo;ll be paid 24 h after this.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 4000))}
              rows={5}
              placeholder="e.g. Ate lunch at 12.30, settled for a nap at 1pm, woke happy."
              className="mt-3 w-full rounded-xl border border-line p-3 text-[14px]"
            />
            {err && <p className="mt-2 text-[12px] text-rose-700">{err}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? "Finishing…" : "Confirm check-out"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QuickLogModal({
  bookingId,
  kind,
  photoConsent,
  onClose,
  onPosted,
}: {
  bookingId: string;
  kind: QuickKind;
  photoConsent: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    let photoPath: string | null = null;
    try {
      if (photo && photoConsent) {
        const sb = createClient();
        const { data: u } = await sb.auth.getUser();
        const userId = u.user?.id;
        if (userId) {
          const ext = (photo.name.split(".").pop() ?? "jpg").toLowerCase();
          photoPath = `${userId}/${kind}-${bookingId}-${Date.now()}.${ext}`;
          const { error: upErr } = await sb.storage
            .from(PHOTOS_BUCKET)
            .upload(photoPath, photo, {
              upsert: true,
              contentType: photo.type || "image/jpeg",
            });
          if (upErr) {
            setErr(upErr.message);
            setBusy(false);
            return;
          }
        }
      }
      const res = await fetch(`/api/m/active-job/${bookingId}/quick-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          body: body.trim() || undefined,
          photo_path: photoPath ?? undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? "Couldn't save.");
        return;
      }
      onPosted();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const heading = useMemo(() => {
    const m = QUICK_LOG_KINDS.find((q) => q.kind === kind);
    return m ? `${m.emoji} ${m.label}` : kind;
  }, [kind]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 grid items-end"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[18px] font-bold text-heading">{heading}</h3>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 2000))}
          rows={4}
          placeholder="Anything to add? (optional)"
          className="mt-3 w-full rounded-xl border border-line p-3 text-[14px]"
        />
        {photoConsent && (
          <div className="mt-3">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                className="w-full rounded-xl border border-line mb-2"
              />
            )}
            <Button
              variant="outline"
              block
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {photo ? "Replace photo" : "Add photo (optional)"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPhoto(f);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(URL.createObjectURL(f));
                }
              }}
            />
          </div>
        )}
        {err && <p className="mt-2 text-[12px] text-rose-700">{err}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save log"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActiveSosButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function send() {
    setPhase("sending");
    setErr(null);
    try {
      const pos = await getCurrentPosition();
      const res = await fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          lat: pos?.coords.latitude ?? null,
          lng: pos?.coords.longitude ?? null,
          accuracyM: pos?.coords.accuracy ?? null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't send SOS.");
        setPhase("error");
        return;
      }
      setPhase("sent");
    } catch {
      setErr("Network error.");
      setPhase("error");
    }
  }

  function reset() {
    setOpen(false);
    setPhase("idle");
    setNote("");
    setErr(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Raise SOS"
        className="fixed right-4 bottom-24 z-30 grid h-16 w-16 place-items-center rounded-full bg-rose-600 text-white font-extrabold text-[18px] shadow-lg active:scale-95 transition focus:outline-none focus:ring-4 focus:ring-rose-300"
      >
        SOS
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 grid items-end"
          onClick={() => phase !== "sending" && reset()}
        >
          <div
            className="bg-white rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {phase === "idle" && (
              <>
                <h3 className="text-[18px] font-extrabold text-heading">
                  Raise an SOS?
                </h3>
                <p className="mt-1 text-[13px] text-subheading">
                  If this is a life-threatening emergency, call{" "}
                  <strong>999</strong> (UK) or <strong>911</strong> (US) first.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    href="tel:999"
                    className="inline-flex items-center justify-center h-14 rounded-btn bg-rose-600 text-white font-extrabold text-[18px]"
                  >
                    Call 999
                  </a>
                  <a
                    href="tel:911"
                    className="inline-flex items-center justify-center h-14 rounded-btn bg-rose-600 text-white font-extrabold text-[18px]"
                  >
                    Call 911
                  </a>
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                  rows={3}
                  placeholder="Optional note"
                  className="mt-3 w-full rounded-xl border border-line p-3 text-[14px]"
                />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={reset}>
                    Cancel
                  </Button>
                  <button
                    type="button"
                    onClick={send}
                    className="inline-flex items-center justify-center h-12 rounded-btn bg-rose-600 text-white font-bold text-[15px]"
                  >
                    Send SOS
                  </button>
                </div>
              </>
            )}
            {phase === "sending" && (
              <p className="text-center py-6 font-bold text-heading">
                Sending SOS…
              </p>
            )}
            {phase === "sent" && (
              <>
                <h3 className="text-[18px] font-extrabold text-heading">
                  SOS sent
                </h3>
                <p className="mt-1 text-[13px] text-subheading">
                  Trust &amp; safety has been notified. Stay safe.
                </p>
                <Button block className="mt-4" onClick={reset}>
                  Close
                </Button>
              </>
            )}
            {phase === "error" && (
              <>
                <h3 className="text-[18px] font-extrabold text-heading">
                  Couldn&rsquo;t send SOS
                </h3>
                <p className="mt-1 text-[13px] text-rose-700">{err}</p>
                <Button block className="mt-4" onClick={reset}>
                  Close
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
