"use client";

/**
 * /settings/data — client state.
 *
 * Form for submitting a new DSAR (access / rectification / portability)
 * plus read-only lists of existing DSARs and any account_deletion_jobs
 * the user has open. Erasure is handled at /settings/danger-zone —
 * we deliberately do not duplicate that flow here.
 *
 * Signed-download flow: for a delivered request we link to
 * /api/dsar/[id]/download which server-side verifies ownership and
 * issues a fresh 15-minute signed URL against the delivery_object_path
 * (signed URLs from the email expire in 24h and can't be persisted).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type DsarRequestSummary = {
  id: string;
  request_type: string;
  state: string;
  created_at: string;
  verified_at: string | null;
  delivered_at: string | null;
  delivery_object_path: string | null;
};

export type DeletionJobSummary = {
  id: string;
  state: string;
  requested_at: string;
  verified_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  blocker_codes: string[] | null;
};

type Kind = "access" | "rectification" | "portability";

const KIND_LABEL: Record<Kind, string> = {
  access: "Access — a copy of the personal data we hold about you",
  rectification: "Rectification — correct inaccurate or incomplete data",
  portability: "Portability — a machine-readable copy for another service",
};

const STATE_PILL: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700",
  verifying: "bg-amber-100 text-amber-800",
  in_progress: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-100 text-slate-500",
  erased: "bg-emerald-100 text-emerald-800",
  retention_scheduled: "bg-violet-100 text-violet-800",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function DataRightsClient({
  subjectUserId,
  subjectEmail,
  initialDsars,
  initialDeletionJobs,
}: {
  subjectUserId: string;
  subjectEmail: string;
  initialDsars: DsarRequestSummary[];
  initialDeletionJobs: DeletionJobSummary[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("access");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const dsars = initialDsars;

  async function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fetch("/api/dsar/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject_email: subjectEmail,
          subject_user_id: subjectUserId,
          request_type: kind,
          notes: notes || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        fast_path?: boolean;
      };
      if (!res.ok || !body.ok) {
        setError(body.code ?? `submit_failed_${res.status}`);
        return;
      }
      setNotice(
        body.fast_path
          ? `Request received — we'll email ${subjectEmail} within one calendar month with the result.`
          : `Check ${subjectEmail} to confirm your request within 24 hours.`,
      );
      setNotes("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8" data-testid="data-rights-client">
      <section
        className="bg-white rounded-xl border border-slate-200 p-6"
        aria-labelledby="dsar-new"
      >
        <h2
          id="dsar-new"
          className="text-lg font-semibold text-slate-900 mb-4"
        >
          Make a new request
        </h2>

        <fieldset className="mb-4">
          <legend className="sr-only">Request type</legend>
          <div className="space-y-2">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <label
                key={k}
                className="flex items-start gap-3 text-sm text-slate-800 cursor-pointer"
              >
                <input
                  type="radio"
                  name="dsar-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="mt-1"
                  data-testid={`dsar-kind-${k}`}
                />
                <span>{KIND_LABEL[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block mb-4">
          <span className="text-sm font-medium text-slate-800 mb-1 block">
            Anything else we should know? (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={4}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. specific date range, particular records"
          />
        </label>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            Something went wrong ({error}). Please try again or email{" "}
            <a
              className="underline"
              href="mailto:privacy@allcare4u.co.uk"
            >
              privacy@allcare4u.co.uk
            </a>
            .
          </div>
        ) : null}
        {notice ? (
          <div
            role="status"
            className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            {notice}
          </div>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          data-testid="dsar-submit"
        >
          {busy ? "Sending…" : "Submit request"}
        </button>

        <p className="mt-3 text-xs text-slate-500">
          Signed in as <strong>{subjectEmail}</strong>. We already know
          it's you, so we don't need you to click a confirmation link.
          For your records we'll still send a confirmation email.
        </p>
      </section>

      <section
        className="bg-white rounded-xl border border-slate-200 p-6"
        aria-labelledby="dsar-history"
      >
        <h2
          id="dsar-history"
          className="text-lg font-semibold text-slate-900 mb-4"
        >
          Your requests
        </h2>
        {dsars.length === 0 ? (
          <p className="text-sm text-slate-600">
            You haven't made any requests yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dsars.map((d) => (
              <li
                key={d.id}
                className="py-3 flex items-center justify-between gap-4"
                data-testid={`dsar-row-${d.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-900 capitalize">
                      {d.request_type}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATE_PILL[d.state] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {d.state.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Requested {fmtDate(d.created_at)}
                    {d.delivered_at
                      ? ` · Delivered ${fmtDate(d.delivered_at)}`
                      : null}
                  </div>
                </div>
                {d.state === "delivered" && d.delivery_object_path ? (
                  <a
                    className="shrink-0 text-sm font-medium text-teal-700 underline"
                    href={`/api/dsar/${d.id}/download`}
                    data-testid={`dsar-download-${d.id}`}
                  >
                    Download
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="bg-white rounded-xl border border-slate-200 p-6"
        aria-labelledby="deletion-jobs"
      >
        <h2
          id="deletion-jobs"
          className="text-lg font-semibold text-slate-900 mb-2"
        >
          Account deletion
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Account deletion is handled in the{" "}
          <Link
            href="/settings/danger-zone"
            className="text-teal-700 underline"
          >
            danger zone
          </Link>
          . You can see any deletion requests you have already made here.
        </p>
        {initialDeletionJobs.length === 0 ? (
          <p className="text-sm text-slate-500">
            No deletion requests on file.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {initialDeletionJobs.map((j) => (
              <li
                key={j.id}
                className="py-3 flex items-center justify-between gap-4"
                data-testid={`deletion-row-${j.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        j.state === "complete"
                          ? "bg-emerald-100 text-emerald-800"
                          : j.state.startsWith("blocked_")
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {j.state.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Requested {fmtDate(j.requested_at)}
                    {j.completed_at
                      ? ` · Completed ${fmtDate(j.completed_at)}`
                      : null}
                    {j.cancelled_at
                      ? ` · Cancelled ${fmtDate(j.cancelled_at)}`
                      : null}
                  </div>
                </div>
                <Link
                  className="shrink-0 text-sm font-medium text-slate-700 underline"
                  href="/settings/danger-zone"
                >
                  Manage
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
