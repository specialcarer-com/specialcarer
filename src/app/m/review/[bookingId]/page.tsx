"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  TextArea,
  TopBar,
} from "../../_components/ui";
import { serviceLabel } from "@/lib/care/services";
import {
  REVIEW_BODY_LIMIT,
  validateReviewForm,
  type ReviewFormError,
} from "@/lib/m/review-hub";

/**
 * Review write/edit form for one completed booking (PR-R4).
 *
 * Loads the booking + any existing review via GET /api/bookings/[id]/review
 * (prefills in edit mode), then upserts via POST to the same route — the
 * established seeker-only review write path. On success, redirects back to
 * the hub and surfaces a toast.
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      caregiverName: string | null;
      caregiverAvatar: string | null;
      serviceType: string;
      reviewable: boolean;
      rating: number;
      body: string;
    };

const STAR_LABELS = ["Poor", "Fair", "Good", "Great", "Excellent"];

export default function ReviewFormPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<ReviewFormError>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/review`, {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace(
            `/m/login?next=${encodeURIComponent(`/m/review/${bookingId}`)}`,
          );
          return;
        }
        if (!res.ok) {
          setState({
            kind: "error",
            message:
              res.status === 403
                ? "You can only review your own bookings."
                : res.status === 404
                  ? "Booking not found."
                  : "Could not load this booking.",
          });
          return;
        }
        const json = (await res.json()) as {
          booking: {
            caregiver_name: string | null;
            caregiver_avatar: string | null;
            service_type: string;
            reviewable: boolean;
          };
          review: { rating: number; body: string | null } | null;
        };
        if (cancelled) return;
        setRating(json.review?.rating ?? 0);
        setBody(json.review?.body ?? "");
        setState({
          kind: "ready",
          caregiverName: json.booking.caregiver_name,
          caregiverAvatar: json.booking.caregiver_avatar,
          serviceType: json.booking.service_type,
          reviewable: json.booking.reviewable,
          rating: json.review?.rating ?? 0,
          body: json.review?.body ?? "",
        });
      } catch {
        if (!cancelled)
          setState({ kind: "error", message: "Could not load this booking." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function onSubmit() {
    const err = validateReviewForm({ rating, body });
    setFormError(err);
    if (err) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: body.trim() || undefined }),
      });
      if (res.status === 401) {
        router.replace(
          `/m/login?next=${encodeURIComponent(`/m/review/${bookingId}`)}`,
        );
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setToast(j.error ?? "Could not save your review.");
        setSubmitting(false);
        return;
      }
      setToast("Review submitted. Thank you!");
      // Brief beat so the toast is visible before navigating back.
      setTimeout(() => {
        router.push("/m/review");
      }, 800);
    } catch {
      setToast("Could not save your review.");
      setSubmitting(false);
    }
  }

  const name =
    state.kind === "ready" ? state.caregiverName ?? "Your caregiver" : "";

  return (
    <main className="min-h-[100dvh] bg-bg-screen">
      <TopBar back="/m/review" title="Write a review" />

      <div className="px-4 mt-4 space-y-4 pb-10">
        {state.kind === "loading" && (
          <Card>
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </Card>
        )}

        {state.kind === "error" && (
          <Card className="text-center py-8">
            <p className="text-heading font-semibold">{state.message}</p>
            <button
              onClick={() => router.push("/m/review")}
              className="mt-4 text-primary font-bold"
            >
              Back to reviews
            </button>
          </Card>
        )}

        {state.kind === "ready" && (
          <>
            <Card>
              <div className="flex items-center gap-3">
                <Avatar
                  src={state.caregiverAvatar ?? undefined}
                  name={name}
                  size={56}
                />
                <div className="min-w-0">
                  <p className="text-[16px] font-bold text-heading truncate">
                    {name}
                  </p>
                  {state.serviceType && (
                    <p className="mt-0.5 text-[13px] text-subheading truncate">
                      {serviceLabel(state.serviceType)}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {!state.reviewable && (
              <p className="text-[13px] text-[#0F1416] bg-[#F4EFE6] border border-[#F4A261] rounded-btn px-3 py-2">
                Reviews open once the shift is complete.
              </p>
            )}

            <Card>
              <p className="text-[14px] font-semibold text-heading mb-3">
                Your rating
              </p>
              <div
                className="flex items-center gap-2"
                role="radiogroup"
                aria-label="Star rating"
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = n <= rating;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      onClick={() => {
                        setRating(n);
                        if (formError === "rating") setFormError(null);
                      }}
                      className="sc-no-select active:scale-95 transition-transform"
                    >
                      <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill={active ? "#F5B400" : "#E5E7EB"}
                        aria-hidden="true"
                      >
                        <path d="M12 2l2.9 6.9L22 9.7l-5.5 4.7L18.2 22 12 18.4 5.8 22l1.7-7.6L2 9.7l7.1-.8L12 2z" />
                      </svg>
                    </button>
                  );
                })}
              </div>
              {rating > 0 && (
                <p className="mt-2 text-[13px] text-subheading">
                  {STAR_LABELS[rating - 1]}
                </p>
              )}
              {formError === "rating" && (
                <p className="mt-2 text-[12px] text-[#0F1416]">
                  Please pick a rating from 1 to 5 stars.
                </p>
              )}
            </Card>

            <Card>
              <TextArea
                label="Your review (optional)"
                placeholder="Share how the booking went…"
                rows={5}
                value={body}
                maxLength={REVIEW_BODY_LIMIT}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (formError === "body") setFormError(null);
                }}
                error={
                  formError === "body"
                    ? `Reviews are limited to ${REVIEW_BODY_LIMIT} characters.`
                    : undefined
                }
              />
              <p className="mt-1.5 text-right text-[12px] text-subheading">
                {body.length}/{REVIEW_BODY_LIMIT}
              </p>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="ghost"
                block
                type="button"
                onClick={() => router.push("/m/review")}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                block
                type="button"
                onClick={onSubmit}
                disabled={submitting || !state.reviewable}
              >
                {submitting ? "Saving…" : "Submit review"}
              </Button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <div className="rounded-pill bg-heading text-white text-[14px] font-semibold px-5 py-3 shadow-card-md">
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}
