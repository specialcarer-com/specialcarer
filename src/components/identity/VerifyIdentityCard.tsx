"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/app/m/_components/ui";

/** SpecialCarers brand teal — used for the primary verify CTA. */
const BRAND_TEAL = "#039EA0";

type SessionStatus =
  | "created"
  | "started"
  | "submitted"
  | "approved"
  | "declined"
  | "resubmission_requested"
  | "review"
  | "expired"
  | "abandoned";

type LatestSession = {
  sessionId: string | null;
  status: SessionStatus | null;
  verificationUrl: string | null;
};

/** Human label for each non-terminal "pending" status. */
const PENDING_LABEL: Partial<Record<SessionStatus, string>> = {
  created: "Not finished",
  started: "In progress",
  submitted: "Submitted",
  review: "Under review",
  resubmission_requested: "Action needed",
};

function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" }) {
  const styles =
    tone === "green"
      ? { bg: "#E7F6EE", color: "#2C7A3F" }
      : { bg: "#FFF6E5", color: "#9A6B00" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill px-3 h-7 text-[11px] font-semibold"
      style={{ background: styles.bg, color: styles.color }}
    >
      {label}
    </span>
  );
}

/**
 * Identity verification card (Veriff).
 *
 * Renders nothing until a status is resolved. The GET endpoint returns 403 when
 * the IDENTITY_VERIFICATION_ENABLED flag is off, so the card stays hidden while
 * the feature is disabled.
 *
 *   approved                       → green "Identity verified" badge
 *   started/submitted/review/...   → status pill (no CTA, in-flight)
 *   not started / declined / etc.  → "Verify your identity" CTA → POST then
 *                                     redirect to the Veriff verificationUrl
 *
 * Pass an optional `sessionId` to poll a specific session; otherwise the card
 * fetches the caller's latest by POSTing the idempotent start endpoint, which
 * returns the active session when one exists.
 */
export default function VerifyIdentityCard() {
  const [session, setSession] = useState<LatestSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      // POST is idempotent — returns the active session if one exists,
      // otherwise creates one. We only read status here; the explicit CTA
      // handles the redirect so we don't navigate users away on mount.
      const res = await fetch("/api/m/identity/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as LatestSession;
        setSession(data);
      }
    } catch {
      // leave session null; card stays hidden
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startVerification = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/m/identity/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as LatestSession;
        if (data.verificationUrl) {
          window.location.href = data.verificationUrl;
          return;
        }
      }
    } catch {
      // fall through; re-enable the button
    }
    setStarting(false);
  }, []);

  if (!loaded || !session) return null;

  const status = session.status;

  if (status === "approved") {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[14px] font-bold text-heading">Identity</p>
            <p className="text-[12px] text-subheading mt-0.5">
              Your identity has been verified.
            </p>
          </div>
          <StatusPill label="Identity verified ✓" tone="green" />
        </div>
      </Card>
    );
  }

  const pendingLabel = status ? PENDING_LABEL[status] : undefined;
  const inFlight = Boolean(pendingLabel) && status !== "resubmission_requested";

  if (inFlight && pendingLabel) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[14px] font-bold text-heading">Identity</p>
            <p className="text-[12px] text-subheading mt-0.5">
              We&apos;re checking your verification.
            </p>
          </div>
          <StatusPill label={pendingLabel} tone="amber" />
        </div>
      </Card>
    );
  }

  // Not started, declined, expired, abandoned, or resubmission_requested → CTA.
  const ctaLabel =
    status === "declined"
      ? "Try verifying again"
      : status === "resubmission_requested"
        ? "Resubmit your documents"
        : "Verify your identity";

  return (
    <Card>
      <p className="text-[14px] font-bold text-heading mb-1">
        Verify your identity
      </p>
      <p className="text-[12px] text-subheading mb-3 leading-relaxed">
        Confirm who you are with a quick, secure check. It helps keep
        SpecialCarers safe for everyone.
      </p>
      <button
        type="button"
        onClick={startVerification}
        disabled={starting}
        className="inline-flex w-full items-center justify-center h-12 rounded-btn text-white font-bold text-[15px] transition active:scale-[0.99] disabled:opacity-60 sc-no-select"
        style={{ background: BRAND_TEAL }}
      >
        {starting ? "Starting…" : ctaLabel}
      </button>
    </Card>
  );
}
