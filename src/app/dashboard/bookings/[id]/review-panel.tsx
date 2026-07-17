"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe/client";
import {
  CATEGORY_KEYS,
  CATEGORY_LABEL,
  MAX_PRIVATE_FEEDBACK,
  MAX_PUBLIC_BODY,
  MAX_TAGS,
  REVIEW_TAG_OPTIONS,
  TIP_QUICK_AMOUNTS,
  TIP_MAX_CENTS,
  TIP_MIN_CENTS,
  type CategoryKey,
} from "@/lib/reviews/types";

type ExistingReview = {
  rating: number;
  body: string | null;
  rating_punctuality: number | null;
  rating_communication: number | null;
  rating_care_quality: number | null;
  rating_cleanliness: number | null;
  tags: string[];
};

type Currency = "GBP" | "USD";

export default function ReviewPanel({
  bookingId,
  caregiverName,
  existing,
  currency,
}: {
  bookingId: string;
  caregiverName: string;
  existing: ExistingReview | null;
  currency: Currency;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(existing?.rating ?? 5);
  const [body, setBody] = useState<string>(existing?.body ?? "");
  const [categoryRatings, setCategoryRatings] = useState<
    Record<CategoryKey, number>
  >({
    punctuality: existing?.rating_punctuality ?? 0,
    communication: existing?.rating_communication ?? 0,
    care_quality: existing?.rating_care_quality ?? 0,
    cleanliness: existing?.rating_cleanliness ?? 0,
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(
    existing?.tags ?? [],
  );
  const [showPrivate, setShowPrivate] = useState(false);
  const [privateFeedback, setPrivateFeedback] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Tip flow state
  const [tipChoice, setTipChoice] = useState<number | "custom" | null>(null);
  const [customTip, setCustomTip] = useState<string>("");
  const [tipClientSecret, setTipClientSecret] = useState<string | null>(null);
  const [tipPending, setTipPending] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [tipDone, setTipDone] = useState(false);

  const tipAmountCents: number | null = (() => {
    if (tipChoice == null) return null;
    if (tipChoice === "custom") {
      const n = Number(customTip.replace(/[^\d.]/g, ""));
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.round(n * 100);
    }
    return tipChoice;
  })();

  function toggleTag(key: string) {
    setSelectedTags((prev) => {
      if (prev.includes(key)) return prev.filter((t) => t !== key);
      if (prev.length >= MAX_TAGS) return prev;
      return [...prev, key];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        rating,
        body: body.trim() || undefined,
        tags: selectedTags,
      };
      for (const k of CATEGORY_KEYS) {
        if (categoryRatings[k] >= 1 && categoryRatings[k] <= 5) {
          payload[`rating_${k}`] = categoryRatings[k];
        }
      }
      if (privateFeedback.trim().length > 0) {
        payload.private_feedback = privateFeedback.trim();
      }
      const res = await fetch(`/api/bookings/${bookingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Submit failed");
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function startTip() {
    if (!tipAmountCents) return;
    if (tipAmountCents < TIP_MIN_CENTS || tipAmountCents > TIP_MAX_CENTS) {
      setTipError(`Tip must be between ${TIP_MIN_CENTS / 100} and ${TIP_MAX_CENTS / 100}.`);
      return;
    }
    setTipPending(true);
    setTipError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: tipAmountCents, currency }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        client_secret?: string;
        error?: string;
      };
      if (!res.ok || !json.client_secret) {
        throw new Error(json.error ?? "Could not start tip");
      }
      setTipClientSecret(json.client_secret);
    } catch (e) {
      setTipError(e instanceof Error ? e.message : "Could not start tip");
    } finally {
      setTipPending(false);
    }
  }

  const sym = currency === "USD" ? "$" : "£";

  return (
    <div className="mt-6 p-5 rounded-2xl bg-white border border-slate-100">
      <h2 className="font-semibold">Rate {caregiverName}</h2>
      <p className="mt-1 text-sm text-slate-600">
        How was the shift? Your review helps other families and the caregiver.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-5">
        {/* Overall stars */}
        <StarRow
          label="Overall"
          value={rating}
          onChange={setRating}
          required
        />

        {/* Category sub-ratings */}
        <div className="space-y-2">
          {CATEGORY_KEYS.map((k) => (
            <StarRow
              key={k}
              label={CATEGORY_LABEL[k]}
              value={categoryRatings[k]}
              onChange={(n) => setCategoryRatings((p) => ({ ...p, [k]: n }))}
              size="sm"
            />
          ))}
        </div>

        {/* Tags */}
        <div>
          <p className="text-sm font-semibold text-slate-800">
            What stood out? <span className="text-slate-500 font-normal">(up to {MAX_TAGS})</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REVIEW_TAG_OPTIONS.map((t) => {
              const on = selectedTags.includes(t.key);
              const disabled =
                !on && selectedTags.length >= MAX_TAGS;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleTag(t.key)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-full border text-sm transition ${
                    on
                      ? "bg-brand text-white border-brand"
                      : disabled
                        ? "bg-white text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Public review body */}
        <div>
          <label className="text-sm font-semibold text-slate-800 block">
            Public review
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX_PUBLIC_BODY}
            rows={4}
            placeholder="What stood out? Anything other families should know?"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {/* Private feedback toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowPrivate((v) => !v)}
            className="text-sm text-brand-700 hover:underline"
          >
            {showPrivate ? "Hide" : "Send"} private feedback to SpecialCarer
          </button>
          {showPrivate && (
            <textarea
              value={privateFeedback}
              onChange={(e) => setPrivateFeedback(e.target.value)}
              maxLength={MAX_PRIVATE_FEEDBACK}
              rows={3}
              placeholder="Anything you'd like our team to know but not show publicly?"
              className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
          >
            {submitting
              ? "Saving…"
              : existing
                ? "Update review"
                : "Submit review"}
          </button>
          {savedAt && (
            <span className="text-sm text-emerald-700">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </form>

      {/* Tip section */}
      <div className="mt-6 pt-5 border-t border-slate-100">
        <h3 className="font-semibold text-slate-900">
          Tip your carer?
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Every penny goes directly to them — no platform fee.
        </p>

        {tipDone ? (
          <p className="mt-3 text-sm text-emerald-700">
            Tip sent — thank you!
          </p>
        ) : tipClientSecret ? (
          <div className="mt-4">
            <Elements
              stripe={getStripe()}
              options={{ clientSecret: tipClientSecret }}
            >
              <TipPaymentForm
                amountLabel={`${sym}${((tipAmountCents ?? 0) / 100).toFixed(2)}`}
                onComplete={() => {
                  setTipDone(true);
                  router.refresh();
                }}
              />
            </Elements>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {TIP_QUICK_AMOUNTS[currency].map((q) => {
                const on = tipChoice === q.amount_cents;
                return (
                  <button
                    key={q.amount_cents}
                    type="button"
                    onClick={() => {
                      setTipChoice(q.amount_cents);
                      setCustomTip("");
                    }}
                    className={`px-4 py-2 rounded-full border text-sm font-medium transition ${
                      on
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setTipChoice("custom")}
                className={`px-4 py-2 rounded-full border text-sm font-medium transition ${
                  tipChoice === "custom"
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                Custom
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipChoice(null);
                  setCustomTip("");
                  setTipError(null);
                }}
                className="px-4 py-2 rounded-full border border-transparent text-sm text-slate-500 hover:text-slate-700"
              >
                Skip tip
              </button>
            </div>
            {tipChoice === "custom" && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500">{sym}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  placeholder="15.00"
                  className="px-3 py-2 rounded-xl border border-slate-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100 w-32"
                />
              </div>
            )}
            {tipChoice != null && tipAmountCents != null && (
              <button
                type="button"
                onClick={startTip}
                disabled={tipPending}
                className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
              >
                {tipPending
                  ? "Preparing…"
                  : `Send ${sym}${(tipAmountCents / 100).toFixed(2)} tip`}
              </button>
            )}
            {tipError && <p className="text-sm text-rose-600">{tipError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function StarRow({
  label,
  value,
  onChange,
  size = "md",
  required = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  size?: "md" | "sm";
  required?: boolean;
}) {
  const sizeClass = size === "sm" ? "text-xl" : "text-3xl";
  return (
    <div className="flex items-center gap-3">
      <span
        className={`${
          size === "sm" ? "text-sm" : "text-sm font-semibold"
        } text-slate-700 w-32 shrink-0`}
      >
        {label}
        {required && size !== "sm" && <span className="text-rose-500">*</span>}
      </span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${label} ${n} star${n > 1 ? "s" : ""}`}
            className={`${sizeClass} leading-none focus:outline-none`}
          >
            <span
              className={
                n <= value ? "text-amber-500" : "text-slate-300"
              }
            >
              ★
            </span>
          </button>
        ))}
        {size === "sm" && value > 0 && (
          <span className="ml-2 text-xs text-slate-500">{value}/5</span>
        )}
      </div>
    </div>
  );
}

function TipPaymentForm({
  amountLabel,
  onComplete,
}: {
  amountLabel: string;
  onComplete: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setConfirming(true);
    setConfirmErr(null);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      if (error) {
        setConfirmErr(error.message ?? "Payment failed");
        return;
      }
      onComplete();
    } catch (e) {
      setConfirmErr(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <form onSubmit={pay} className="space-y-3">
      <PaymentElement />
      <button
        type="submit"
        disabled={confirming || !stripe || !elements}
        className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
      >
        {confirming ? "Confirming…" : `Tip ${amountLabel}`}
      </button>
      {confirmErr && <p className="text-sm text-rose-600">{confirmErr}</p>}
    </form>
  );
}
