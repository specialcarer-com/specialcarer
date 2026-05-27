"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Seeker SOS button. Renders a prominent magenta CTA on the booking
 * detail page; on tap, presents a two-step confirm modal. Confirm
 * POSTs to the existing `/api/sos` endpoint, which inserts an
 * `sos_alerts` row (via raiseSos) and fans out admin + counterpart +
 * emergency-contact email notifications server-side.
 *
 * The button is intentionally purely client-side — no server logic
 * lives here. Visibility gating (status, role, ±2h window) is the
 * caller's responsibility; see `sos-visibility.ts`.
 */

const SOS_BG = "#A12C7B"; // error / panic accent — distinct from teal brand
const TEAL_INK = "#0F1416";
const CREAM = "#F4EFE6";

type GeoCoords = {
  lat: number;
  lng: number;
  accuracyM: number | null;
};

async function readBrowserCoords(timeoutMs = 1500): Promise<GeoCoords | null> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.geolocation === "undefined"
  ) {
    return null;
  }
  return new Promise<GeoCoords | null>((resolve) => {
    let settled = false;
    const finish = (val: GeoCoords | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          finish({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: Number.isFinite(pos.coords.accuracy)
              ? pos.coords.accuracy
              : null,
          });
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 30_000 },
      );
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

export type SosButtonProps = {
  bookingId: string;
};

export function SosButton({ bookingId }: SosButtonProps) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    | { kind: "ok"; emergencyContacts: number }
    | { kind: "error"; message: string }
    | null
  >(null);

  // Close on Escape so keyboard users aren't trapped.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sending]);

  const submit = useCallback(async () => {
    setSending(true);
    setResult(null);
    // Best-effort location, never block the send.
    const coords = await readBrowserCoords();
    try {
      const res = await fetch("/api/sos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          accuracyM: coords?.accuracyM ?? null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setResult({
          kind: "error",
          message: j?.error ?? `Couldn't send SOS (HTTP ${res.status})`,
        });
        return;
      }
      const j = (await res.json()) as { emergency_contacts_count?: number };
      setResult({
        kind: "ok",
        emergencyContacts: j.emergency_contacts_count ?? 0,
      });
    } catch (e) {
      setResult({
        kind: "error",
        message:
          e instanceof Error
            ? e.message
            : "Network error — please try calling 999.",
      });
    } finally {
      setSending(false);
    }
  }, [bookingId]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="w-full h-14 rounded-btn font-bold text-white shadow-sm active:scale-[0.99] transition"
        style={{
          background: SOS_BG,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 17,
        }}
      >
        SOS — Get help now
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sos-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-6 sm:pb-0"
          onClick={() => {
            if (!sending) setOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-card p-5 shadow-xl"
            style={{
              background: "#FFFFFF",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {result?.kind === "ok" ? (
              <>
                <p
                  id="sos-modal-title"
                  className="text-[17px] font-bold"
                  style={{ color: TEAL_INK }}
                >
                  SOS sent
                </p>
                <p
                  className="mt-2 text-[14px] leading-relaxed"
                  style={{ color: "#2F2E31" }}
                >
                  The SpecialCarer team and your carer have been notified.
                  {result.emergencyContacts > 0
                    ? ` Your ${result.emergencyContacts} emergency contact${
                        result.emergencyContacts === 1 ? "" : "s"
                      } have also been alerted.`
                    : ""}
                </p>
                <p
                  className="mt-3 text-[13px] leading-relaxed"
                  style={{ color: "#575757" }}
                >
                  If this is a life-threatening emergency, call <strong>999</strong> now.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-5 w-full h-12 rounded-btn font-bold text-white"
                  style={{ background: SOS_BG, fontSize: 16 }}
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <p
                  id="sos-modal-title"
                  className="text-[17px] font-bold"
                  style={{ color: TEAL_INK }}
                >
                  Send SOS alert?
                </p>
                <p
                  className="mt-2 text-[14px] leading-relaxed"
                  style={{ color: "#2F2E31" }}
                >
                  This will alert your carer, the SpecialCarer team, and your
                  emergency contacts immediately.
                </p>
                {result?.kind === "error" && (
                  <p
                    className="mt-3 text-[13px]"
                    style={{ color: "#C22" }}
                    role="alert"
                  >
                    {result.message}
                  </p>
                )}
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={sending}
                    className="h-12 rounded-btn font-bold"
                    style={{
                      background: CREAM,
                      color: TEAL_INK,
                      fontSize: 16,
                      opacity: sending ? 0.6 : 1,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={sending}
                    className="h-12 rounded-btn font-bold text-white"
                    style={{
                      background: SOS_BG,
                      fontSize: 16,
                      opacity: sending ? 0.7 : 1,
                    }}
                  >
                    {sending ? "Sending…" : "Send SOS"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
