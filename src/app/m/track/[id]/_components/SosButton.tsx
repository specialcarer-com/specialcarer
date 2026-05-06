"use client";

/**
 * SOS button — visible on /m/track/[id] for both parties.
 *
 *  • Tap once  → opens a confirmation sheet (prevents accidental pressing).
 *  • Confirm   → grabs current geolocation (best effort, 6s timeout),
 *                POSTs to /api/sos with bookingId + coords + optional note.
 *  • Result    → shows a success state with the alert ID; admin + the
 *                booking counterpart get email notifications.
 *
 * The button is intentionally large, red, and labelled "SOS" — readable
 * at a glance under stress. It is *not* a substitute for emergency
 * services; the success message reminds users to call 999/911 for
 * life-threatening emergencies.
 */

import { useCallback, useState } from "react";
import { Button, TextArea } from "../../../_components/ui";
import { SOS_NOTE_MAX } from "@/lib/sos/types";

type Props = {
  bookingId: string;
};

type Phase = "idle" | "confirming" | "sending" | "sent" | "error";

type Coords = {
  lat: number;
  lng: number;
  accuracyM: number | null;
};

function getPosition(): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (c: Coords | null) => {
      if (settled) return;
      settled = true;
      resolve(c);
    };
    const t = setTimeout(() => finish(null), 6_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        finish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM:
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : null,
        });
      },
      () => {
        clearTimeout(t);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: 5_000, maximumAge: 60_000 },
    );
  });
}

export default function SosButton({ bookingId }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alertId, setAlertId] = useState<string | null>(null);

  const send = useCallback(async () => {
    setPhase("sending");
    setError(null);
    const coords = await getPosition();
    try {
      const r = await fetch("/api/sos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          accuracyM: coords?.accuracyM ?? null,
          note: note.trim() || null,
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Couldn't send SOS.");
      }
      const j = (await r.json()) as { alert: { id: string } };
      setAlertId(j.alert.id);
      setPhase("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send SOS.");
      setPhase("error");
    }
  }, [bookingId, note]);

  const reset = useCallback(() => {
    setPhase("idle");
    setNote("");
    setError(null);
    setAlertId(null);
  }, []);

  return (
    <>
      {/* Floating SOS trigger — fixed bottom-right, above bottom nav. */}
      <button
        type="button"
        onClick={() => setPhase("confirming")}
        aria-label="Raise an SOS alert"
        className="fixed right-4 bottom-24 z-30 grid h-16 w-16 place-items-center rounded-full bg-rose-600 text-white font-extrabold text-[18px] shadow-lg active:scale-95 transition focus:outline-none focus:ring-4 focus:ring-rose-300"
      >
        SOS
      </button>

      {/* Confirmation / status sheet */}
      {phase !== "idle" && (
        <div
          className="fixed inset-0 z-40 bg-black/40 grid items-end"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (phase === "confirming" || phase === "sent" || phase === "error")
              reset();
          }}
        >
          <div
            className="bg-white rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {phase === "confirming" && (
              <>
                <h3 className="text-[18px] font-extrabold text-heading">
                  Raise an SOS?
                </h3>
                <p className="text-[13px] text-subhead mt-1 leading-relaxed">
                  Our team will be alerted immediately. The other party on this
                  booking will also be notified. If this is a life-threatening
                  emergency, please call <strong>999</strong> (UK) or{" "}
                  <strong>911</strong> (US) first.
                </p>
                <div className="mt-4">
                  <TextArea
                    label="Optional message"
                    placeholder="What's happening? (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, SOS_NOTE_MAX))}
                    rows={3}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={reset}>
                    Cancel
                  </Button>
                  <button
                    type="button"
                    onClick={send}
                    className="inline-flex items-center justify-center h-12 rounded-btn bg-rose-600 text-white font-bold text-[15px] active:scale-95 transition"
                  >
                    Send SOS
                  </button>
                </div>
              </>
            )}

            {phase === "sending" && (
              <div className="py-6 text-center">
                <p className="text-[15px] font-bold text-heading">
                  Sending SOS…
                </p>
                <p className="text-[12px] text-subhead mt-1">
                  Capturing your location and alerting our team.
                </p>
              </div>
            )}

            {phase === "sent" && (
              <>
                <h3 className="text-[18px] font-extrabold text-heading">
                  SOS sent
                </h3>
                <p className="text-[13px] text-subhead mt-1 leading-relaxed">
                  Our trust &amp; safety team has been alerted. Stay safe — if
                  this is a life-threatening emergency, please also call{" "}
                  <strong>999</strong> (UK) or <strong>911</strong> (US).
                </p>
                {alertId && (
                  <p className="text-[11px] text-subhead mt-3">
                    Reference: {alertId.slice(0, 8)}
                  </p>
                )}
                <div className="mt-4">
                  <Button block onClick={reset}>
                    Close
                  </Button>
                </div>
              </>
            )}

            {phase === "error" && (
              <>
                <h3 className="text-[18px] font-extrabold text-heading">
                  Couldn&apos;t send SOS
                </h3>
                <p className="text-[13px] text-rose-700 mt-1">
                  {error ?? "Please try again."}
                </p>
                <p className="text-[12px] text-subhead mt-2">
                  If this is a life-threatening emergency, call{" "}
                  <strong>999</strong> (UK) or <strong>911</strong> (US)
                  immediately.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={reset}>
                    Cancel
                  </Button>
                  <button
                    type="button"
                    onClick={send}
                    className="inline-flex items-center justify-center h-12 rounded-btn bg-rose-600 text-white font-bold text-[15px]"
                  >
                    Try again
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
