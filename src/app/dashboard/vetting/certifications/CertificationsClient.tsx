"use client";

import { useState } from "react";
import {
  CERT_TYPES,
  CERT_TYPE_LABEL,
  CERTIFICATIONS_BUCKET,
} from "@/lib/vetting/types";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  cert_type: string;
  issuer: string | null;
  issued_at: string | null;
  expires_at: string | null;
  file_path: string | null;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  verified: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
  expired: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function CertificationsClient({
  initial,
}: {
  initial: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [certType, setCertType] = useState<string>(CERT_TYPES[0].key);
  const [issuer, setIssuer] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      let filePath: string | null = null;
      if (file) {
        const sb = createClient();
        const { data: u } = await sb.auth.getUser();
        const userId = u.user?.id;
        if (!userId) {
          setErr("Sign in to upload.");
          return;
        }
        const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
        filePath = `${userId}/${certType}-${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage
          .from(CERTIFICATIONS_BUCKET)
          .upload(filePath, file, {
            upsert: true,
            contentType: file.type || "application/octet-stream",
          });
        if (upErr) {
          setErr(upErr.message);
          return;
        }
      }
      const res = await fetch("/api/carer/certifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cert_type: certType,
          issuer: issuer.trim() || undefined,
          issued_at: issuedAt || undefined,
          expires_at: expiresAt || undefined,
          file_path: filePath,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        certification?: Row;
        error?: string;
      };
      if (!res.ok || !json.certification) {
        setErr(json.error ?? "Couldn't save.");
        return;
      }
      setRows((r) => [json.certification!, ...r]);
      setIssuer("");
      setIssuedAt("");
      setExpiresAt("");
      setFile(null);
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
        `/api/carer/certifications?id=${encodeURIComponent(id)}`,
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
            No certifications yet. Add your first below.
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
                    {CERT_TYPE_LABEL[r.cert_type] ?? r.cert_type}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.issuer ?? "—"}
                    {r.issued_at ? ` · issued ${r.issued_at}` : ""}
                    {r.expires_at ? ` · expires ${r.expires_at}` : ""}
                  </p>
                  {r.rejection_reason && (
                    <p className="text-xs text-rose-700 mt-1">
                      Rejected: {r.rejection_reason}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${STATUS_TONE[r.status] ?? STATUS_TONE.pending}`}
                >
                  {r.status}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="text-xs font-semibold text-rose-700 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={add}
        className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3"
      >
        <h2 className="font-semibold text-slate-900">Add a certification</h2>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-800 mb-1">
            Type
          </span>
          <select
            value={certType}
            onChange={(e) => setCertType(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            {CERT_TYPES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-800 mb-1">
            Issuer (optional)
          </span>
          <input
            type="text"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            maxLength={120}
            placeholder="e.g. Red Cross, Open University"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800 mb-1">
              Issued
            </span>
            <input
              type="date"
              value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800 mb-1">
              Expires
            </span>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-800 mb-1">
            Certificate file (PDF or image)
          </span>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </label>
        {err && <p className="text-sm text-rose-700">{err}</p>}
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add certification"}
        </button>
      </form>
    </div>
  );
}
