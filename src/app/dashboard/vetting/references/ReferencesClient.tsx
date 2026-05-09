"use client";

import { useState } from "react";

type Row = {
  id: string;
  referee_name: string;
  referee_email: string;
  relationship: string | null;
  status: string;
  token_expires_at: string;
  rating: number | null;
  recommend: boolean | null;
  comment: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  invited: "bg-amber-50 text-amber-800 border-amber-200",
  submitted: "bg-sky-50 text-sky-800 border-sky-200",
  verified: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
  expired: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function ReferencesClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const atCap = rows.length >= 3;

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
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
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
      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No references yet. Add your first below.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {r.referee_name}
                    {r.relationship ? (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        · {r.relationship}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">{r.referee_email}</p>
                  {r.status === "invited" && (
                    <p className="text-xs text-slate-500 mt-1">
                      Link expires{" "}
                      {new Date(r.token_expires_at).toLocaleDateString("en-GB")}
                    </p>
                  )}
                  {r.status === "submitted" && r.submitted_at && (
                    <p className="text-xs text-slate-500 mt-1">
                      Awaiting admin verification
                    </p>
                  )}
                  {r.rating != null && (
                    <p className="text-xs text-slate-500 mt-1">
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
                {r.status === "invited" && (
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="text-xs font-semibold text-rose-700 hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!atCap && (
        <form
          onSubmit={add}
          className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3"
        >
          <h2 className="font-semibold text-slate-900">Add a reference</h2>
          <Field label="Name">
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <Field label="Relationship (optional)">
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              maxLength={80}
              placeholder="e.g. Former manager at Surrey Care"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          {err && <p className="text-sm text-rose-700">{err}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Sending…" : "Send invitation"}
          </button>
        </form>
      )}
      {atCap && (
        <p className="text-xs text-slate-500">
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
      <span className="block text-sm font-semibold text-slate-800 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
