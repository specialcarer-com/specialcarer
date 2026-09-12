"use client";

/**
 * /settings/danger-zone — client-side state.
 *
 * Three modes, driven by the current row (if any):
 *
 *   1. No row exists → show the "Request deletion" CTA.
 *   2. Row in submitted / verifying → show token entry (auto-filled
 *      from ?token=... when the user arrives from the verification
 *      email) + a "Cancel request" button.
 *   3. Row in blocked_* → show the blocker list + a "Cancel request"
 *      button. When the blocker resolves the user submits again.
 *   4. Row in in_progress / deferred / complete → show the status
 *      tracker; complete rows link back to /login.
 *
 * All state transitions round-trip through the three POST routes
 * (submit, verify, cancel). No optimistic UI — we always refetch
 * the row from the server after a mutation so RLS is the source
 * of truth.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type DeletionJobSummary = {
  id: string;
  state: string;
  requested_at: string;
  verified_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  blocker_codes: string[] | null;
  blocked_reason: string | null;
};

type Mode = "idle" | "pending" | "blocked" | "in_flight" | "complete";

function modeFor(job: DeletionJobSummary | null): Mode {
  if (!job) return "idle";
  if (job.state === "complete") return "complete";
  if (job.state === "cancelled") return "idle";
  if (job.state.startsWith("blocked_")) return "blocked";
  if (job.state === "in_progress" || job.state === "deferred") return "in_flight";
  return "pending"; // submitted / verifying
}

export default function DangerZoneClient({
  userEmail,
  tokenFromEmail,
  initialJobs,
}: {
  userEmail: string;
  tokenFromEmail: string | null;
  initialJobs: DeletionJobSummary[];
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // The most recent job that isn't cancelled / stale-complete.
  const current = jobs.find(
    (j) => j.state !== "cancelled" && j.state !== "complete",
  ) ?? null;
  const latestComplete = jobs.find((j) => j.state === "complete") ?? null;
  const mode = modeFor(current ?? latestComplete);

  // Auto-verify when we arrived from the email link.
  useEffect(() => {
    if (!tokenFromEmail || mode !== "pending") return;
    verify(tokenFromEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromEmail]);

  async function refetch() {
    // The page is server-rendered — the simplest way to refresh
    // initialJobs is to trigger a route refresh.
    router.refresh();
  }

  async function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fetch("/api/account/delete/submit", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.code ?? `submit_failed_${res.status}`);
        return;
      }
      if (body.job) {
        setJobs((prev) => [body.job as DeletionJobSummary, ...prev]);
      }
      if (body.eligibility?.eligible) {
        setNotice(
          `We have emailed a confirmation link to ${userEmail}. It expires in 24 hours.`,
        );
      } else {
        setNotice(
          "We can't process a deletion right now — see the list below.",
        );
      }
      refetch();
    });
  }

  async function verify(token: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/account/delete/verify/${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.code ?? `verify_failed_${res.status}`);
        return;
      }
      setNotice(
        body?.eligibility?.eligible
          ? "Verified — your deletion is now in the processing queue. You will receive a completion email once it finishes."
          : "Verified, but a new blocker appeared — see the list below.",
      );
      refetch();
    });
  }

  async function cancel(job_id: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fetch("/api/account/delete/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.code ?? `cancel_failed_${res.status}`);
        return;
      }
      setNotice("Deletion request cancelled.");
      refetch();
    });
  }

  return (
    <section
      aria-labelledby="danger-zone-heading"
      className="bg-white rounded-xl border border-slate-200 p-6"
    >
      <h2
        id="danger-zone-heading"
        className="text-lg font-semibold text-slate-900 mb-2"
      >
        Delete your account
      </h2>
      <p className="text-slate-600 mb-6">
        This erases your profile and personal data under UK GDPR
        Article 17. Some records are kept for a defined period under
        UK law (accounting for six years, safeguarding for six years)
        — you will get a full breakdown in the completion email.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm"
        >
          {friendlyError(error)}
        </div>
      )}
      {notice && (
        <div
          className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-sm"
        >
          {notice}
        </div>
      )}

      {mode === "idle" && (
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Working…" : "Request account deletion"}
        </button>
      )}

      {mode === "pending" && current && (
        <PendingCard
          job={current}
          onCancel={() => cancel(current.id)}
          busy={busy}
          tokenFromEmail={tokenFromEmail}
          onVerify={(t) => verify(t)}
        />
      )}

      {mode === "blocked" && current && (
        <BlockedCard job={current} onCancel={() => cancel(current.id)} busy={busy} />
      )}

      {mode === "in_flight" && current && (
        <InFlightCard job={current} />
      )}

      {mode === "complete" && latestComplete && (
        <CompleteCard job={latestComplete} />
      )}

      {/* History — always visible below the primary widget */}
      {jobs.length > 0 && (
        <>
          <hr className="my-6 border-slate-100" />
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            Recent requests
          </h3>
          <ul className="space-y-2 text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between text-slate-600">
                <span>
                  {new Date(j.requested_at).toLocaleString()} —{" "}
                  <span className="font-mono">{j.state}</span>
                </span>
                <span className="text-xs font-mono text-slate-400">{j.id.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function PendingCard({
  job,
  onCancel,
  busy,
  tokenFromEmail,
  onVerify,
}: {
  job: DeletionJobSummary;
  onCancel: () => void;
  busy: boolean;
  tokenFromEmail: string | null;
  onVerify: (token: string) => void;
}) {
  const [manualToken, setManualToken] = useState("");
  return (
    <div>
      <p className="mb-4 text-slate-700">
        Awaiting confirmation. Open the email we sent and click the
        link, or paste the token below.
      </p>
      {!tokenFromEmail && (
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="Paste token"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => onVerify(manualToken.trim())}
            disabled={busy || !manualToken.trim()}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            Verify
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-sm text-slate-700 underline"
      >
        Cancel this request
      </button>
      <p className="mt-4 text-xs text-slate-500">
        Requested {new Date(job.requested_at).toLocaleString()}. Link
        expires 24 hours later.
      </p>
    </div>
  );
}

function BlockedCard({
  job,
  onCancel,
  busy,
}: {
  job: DeletionJobSummary;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div>
      <p className="mb-3 text-slate-700">
        We can&apos;t delete your account right now:
      </p>
      <p className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
        {job.blocked_reason ??
          "One or more obligations must be resolved first."}
      </p>
      {job.blocker_codes && job.blocker_codes.length > 0 && (
        <ul className="mb-4 text-sm text-slate-600 list-disc pl-5">
          {job.blocker_codes.map((code) => (
            <li key={code}>
              <span className="font-mono">{code}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-sm text-slate-700 underline"
      >
        Cancel this request
      </button>
    </div>
  );
}

function InFlightCard({ job }: { job: DeletionJobSummary }) {
  return (
    <div>
      <p className="mb-2 text-slate-700">
        Your deletion is being processed
        {job.state === "deferred" ? " (retrying — this can take up to a few hours)" : ""}.
      </p>
      <p className="text-xs text-slate-500">
        Verified {job.verified_at ? new Date(job.verified_at).toLocaleString() : "—"}.
        You will get a completion email at your registered address.
      </p>
    </div>
  );
}

function CompleteCard({ job }: { job: DeletionJobSummary }) {
  return (
    <div>
      <p className="mb-2 text-slate-700">
        Your account was deleted on{" "}
        <strong>
          {job.completed_at ? new Date(job.completed_at).toLocaleString() : "—"}
        </strong>
        . You should have received a completion email with the full
        retention breakdown.
      </p>
      <Link className="text-sm text-teal-700 underline" href="/login">
        Return to sign-in &rarr;
      </Link>
    </div>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "rate_limited":
      return "You've hit the safety limit on deletion requests. Please try again in an hour.";
    case "unauthenticated":
      return "Your session has expired — please sign in again.";
    case "schema_not_ready":
      return "This feature isn't available in your environment yet. Try again shortly.";
    case "feature_disabled":
      return "Self-service deletion isn't available on this account. Please email dpo@specialcarer.com.";
    case "token_expired":
      return "That confirmation link expired. Please request a new deletion.";
    case "token_not_found":
      return "That confirmation link isn't valid. Please request a new deletion.";
    case "already_cancelled":
      return "That request was already cancelled.";
    case "not_cancellable":
      return "This request can't be cancelled at this stage. Contact dpo@specialcarer.com if you need help.";
    case "job_not_found":
      return "That request no longer exists.";
    default:
      return `Something went wrong (${code}). Please contact dpo@specialcarer.com.`;
  }
}
