"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "../../../../_components/ui";
import type { CancellationPreview } from "@/lib/org/booking-types";

export default function CancelBookingButton({
  bookingId,
  startsAt,
}: {
  bookingId: string;
  startsAt: string;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/org/bookings/${bookingId}/cancel`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Could not load cancellation preview");
      }
      const d = await res.json();
      setPreview(d.preview as CancellationPreview);
      setShowModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function confirmCancel() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/org/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Cancellation failed");
      }
      router.push("/m/org/bookings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="danger" block onClick={fetchPreview} disabled={loading}>
        {loading && !showModal ? "Loading…" : "Cancel booking"}
      </Button>

      {error && !showModal && (
        <p className="text-[13px] text-rose-700 text-center">{error}</p>
      )}

      {/* Cancellation fee modal */}
      {showModal && preview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-card shadow-xl p-5 space-y-4">
            <p className="text-[16px] font-bold text-heading">
              Confirm cancellation
            </p>

            {/* Fee preview */}
            <Card
              className={`p-4 ${
                preview.timing_bucket === "free"
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <p
                className={`text-[13px] font-semibold mb-1 ${
                  preview.timing_bucket === "free"
                    ? "text-emerald-800"
                    : "text-amber-800"
                }`}
              >
                {preview.timing_bucket === "free"
                  ? "No cancellation fee"
                  : preview.timing_bucket === "partial"
                  ? "50% cancellation fee applies"
                  : "Full cancellation fee applies"}
              </p>
              <p
                className={`text-[12px] ${
                  preview.timing_bucket === "free"
                    ? "text-emerald-700"
                    : "text-amber-700"
                }`}
              >
                {preview.description}
              </p>
              {preview.fee_charged_cents > 0 && (
                <p
                  className={`text-[20px] font-bold mt-2 ${
                    preview.timing_bucket === "full"
                      ? "text-rose-700"
                      : "text-amber-700"
                  }`}
                >
                  £{(preview.fee_charged_cents / 100).toFixed(2)} charged
                </p>
              )}
            </Card>

            <div>
              <label className="block text-[13px] font-semibold text-heading mb-1.5">
                Reason (optional)
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-btn border border-line bg-white px-4 py-3 text-[14px] text-heading resize-none outline-none focus:border-primary"
                placeholder="e.g. Service user hospitalised"
              />
            </div>

            {error && (
              <p className="text-[13px] text-rose-700">{error}</p>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                block
                onClick={() => setShowModal(false)}
                disabled={loading}
              >
                Back
              </Button>
              <Button
                variant="danger"
                block
                onClick={confirmCancel}
                disabled={loading}
              >
                {loading ? "Cancelling…" : "Confirm cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
