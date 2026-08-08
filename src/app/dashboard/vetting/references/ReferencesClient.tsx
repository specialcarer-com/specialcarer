"use client";

import { useState } from "react";
import {
  REFERENCE_TYPE_LABEL,
  REFERENCE_TYPES,
  type ReferenceType,
} from "@/lib/vetting/types";

type Row = {
  id: string;
  referee_name: string;
  referee_email: string;
  relationship: string | null;
  reference_type: ReferenceType | null;
  status: string;
  token_expires_at: string;
  rating: number | null;
  recommend: boolean | null;
  comment: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  created_at: string;
  resend_count?: number;
  last_resend_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  invited: "bg-brand-cream text-brand-ink border-brand-peach/40",
  submitted: "bg-brand-teal/10 text-brand-ink border-brand-teal/30",
  verified: "bg-brand-teal/10 text-brand-ink border-brand-teal/30",
  rejected: "bg-[#F9E9E9] text-[#B24747] border-[#B24747]/30",
  expired: "bg-brand-cream text-brand-ink/70 border-brand-ink/15",
};

export default function ReferencesClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [referenceType, setReferenceType] =
    useState<ReferenceType>("employer");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendErrors, setResendErrors] = useState<Record<string, string>>({});

  const atCap = rows.length >= 3;
  // Existing rows pre-date the type column and are employer references for
  // backward compatibility with the CQC completion gate.
  const verifiedEmployers = rows.filter(
    (row) =>
      row.status === "verified" &&
      (row.reference_type === null || row.reference_type === "employer"),
  ).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (atCap || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/carer/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referee_name: name.trim(),
          referee_email: email.trim(),
          relationship: relationship.trim() || undefined,
          reference_type: referenceType,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        reference?: Row;
        error?: string;
      };
      if (!res.ok || !json.reference) {
        setErr(json.error ?? "Couldn't send invitation.");
        return;
      }
      setRows((r) => [json.reference!, ...r]);
      setName("");
      setEmail("");
      setRelationship("");
      setReferenceType("employer");
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function resend(id: string) {
    if (resendingId) return;
    setResendingId(id);
    setResendErrors((errors) => {
      const next = { ...errors };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch(
        `/api/carer/references/${encodeURIComponent(id)}/resend`,
        { method: "POST" },
      );
      const json = (await res.json().catch(() => ({}))) as {
        reference?: Pick<
          Row,
          "status" | "token_expires_at" | "resend_count" | "last_resend_at"
        >;
        error?: string;
      };
      if (!res.ok || !json.reference) {
        setResendErrors((errors) => ({
          ...errors,
          [id]:
            res.status === 429
              ? "You can resend this invitation up to 3 times in 24 hours."
              : (json.error ?? "Couldn't resend invitation."),
        }));
        return;
      }
      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, ...json.reference } : row,
        ),
      );
    } catch {
      setResendErrors((errors) => ({
        ...errors,
        [id]: "Network error. Please try again.",
      }));
    } finally {
      setResendingId(null);
    }
  }

  async function remove(id: string) {
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    try {
      const res = await fetch(
        `/api/carer/references?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) setRows(prev);
    } catch {
      setRows(prev);
    }
  }

  return (
    <div className="space-y-6">
      {verifiedEmployers < 1 && (
        <div className="rounded-2xl border border-brand-peach/40 bg-brand-cream p-4 text-sm text-brand-ink">
          <strong>CQC requires at least one former-employer reference.</strong>{" "}
          You currently have {verifiedEmployers} verified employer reference
          {verifiedEmployers === 1 ? "" : "s"}.
        </div>
      )}
      <div className="rounded-2xl bg-white border border-brand-ink/15 p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-brand-ink/70">
            No references yet. Add your first below.
          </p>
        ) : (
          <ul className="divide-y divide-brand-ink/10">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-brand-ink">
                    {r.referee_name}
                    {r.relationship ? (
                      <span className="ml-2 text-xs font-normal text-brand-ink/60">
                        · {r.relationship}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-brand-ink/60">{r.referee_email}</p>
                  <span className="mt-1 inline-flex rounded-full border border-brand-teal/20 bg-brand-cream px-2 py-0.5 text-[10px] font-bold tracking-wide text-brand-ink">
                    {(r.reference_type ?? "employer").toUpperCase()}
                  </span>
                  {r.status === "invited" && (
                    <p className="text-xs text-brand-ink/60 mt-1">
                      Link expires{" "}
                      {new Date(r.token_expires_at).toLocaleDateString("en-GB")}
                    </p>
                  )}
                  {r.last_resend_at && (
                    <p className="text-xs text-brand-ink/60 mt-1">
                      Reminded {relativeTime(r.last_resend_at)}
                    </p>
                  )}
                  {r.status === "submitted" && r.submitted_at && (
                    <p className="text-xs text-brand-ink/60 mt-1">
                      Awaiting admin verification
                    </p>
                  )}
                  {r.rating != null && (
                    <p className="text-xs text-brand-ink/60 mt-1">
                      Rated {r.rating}/5{" "}
                      {r.recommend === true ? "· would recommend" : ""}
                      {r.recommend === false ? "· would not recommend" : ""}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${STATUS_TONE[r.status] ?? STATUS_TONE.invited}`}
                >
                  {r.status}
                </span>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {(r.status === "invited" || r.status === "expired") && (
                    <>
                      <button
                        type="button"
                        onClick={() => resend(r.id)}
                        disabled={resendingId !== null}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-teal hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resendingId === r.id && (
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 animate-spin rounded-full border-2 border-[#039EA0] border-t-transparent"
                          />
                        )}
                        {resendingId === r.id ? "Resending…" : "Resend invite"}
                      </button>
                      {resendErrors[r.id] && (
                        <p role="alert" className="max-w-44 text-right text-xs text-[#B24747]">
                          {resendErrors[r.id]}
                        </p>
                      )}
                    </>
                  )}
                  {r.status === "invited" && (
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="text-xs font-semibold text-[#B24747] hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>

              </li>
            ))}
          </ul>
        )}
      </div>

      {!atCap && (
        <form
          onSubmit={add}
          className="rounded-2xl bg-white border border-brand-ink/15 p-5 space-y-3"
        >
          <h2 className="font-semibold text-brand-ink">Add a reference</h2>
          <Field label="Name">
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-full px-3 py-2 rounded-xl border border-brand-ink/15 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/15"
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              className="w-full px-3 py-2 rounded-xl border border-brand-ink/15 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/15"
            />
          </Field>
          <Field label="Relationship (optional)">
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              maxLength={80}
              placeholder="e.g. Former manager at Surrey Care"
              className="w-full px-3 py-2 rounded-xl border border-brand-ink/15 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/15"
            />
          </Field>
          <Field label="Reference type">
            <select
              required
              value={referenceType}
              onChange={(e) => setReferenceType(e.target.value as ReferenceType)}
              className="w-full px-3 py-2 rounded-xl border border-brand-ink/15 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/15"
            >
              {REFERENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {REFERENCE_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </Field>
          {err && <p className="text-sm text-[#B24747]">{err}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-brand-teal text-white text-sm font-semibold hover:bg-[#028688] disabled:opacity-50"
          >
            {saving ? "Sending…" : "Send invitation"}
          </button>
        </form>
      )}
      {atCap && (
        <p className="text-xs text-brand-ink/60">
          You&rsquo;ve added the maximum of 3 references.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-brand-ink mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
