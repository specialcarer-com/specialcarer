import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COMPLIANCE_DOC_TYPES,
  COMPLIANCE_DOC_TYPE_LABEL,
  type ComplianceDocType,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

type Alert = {
  document_id: string;
  caregiver_id: string;
  full_name: string | null;
  email: string | null;
  doc_type: ComplianceDocType;
  status: string;
  expires_at: string | null;
  days_to_expiry: number | null;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  verified: "bg-emerald-50 text-emerald-800 border-emerald-200",
  expired: "bg-rose-50 text-rose-800 border-rose-200",
  rejected: "bg-slate-100 text-slate-600 border-slate-200",
};

export default async function ComplianceDashboard({
  searchParams,
}: {
  searchParams: Promise<{ doc_type?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filterType = sp.doc_type ?? "all";

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const cutoff = in30.toISOString().slice(0, 10);

  const [pending, verified, expired, rejected, expiring] = await Promise.all([
    admin
      .from("compliance_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("compliance_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "verified"),
    admin
      .from("compliance_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "expired"),
    admin
      .from("compliance_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected"),
    admin
      .from("compliance_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "verified")
      .lte("expires_at", cutoff)
      .gte("expires_at", today),
  ]);

  let q = admin
    .from("compliance_alerts_view")
    .select(
      "document_id, caregiver_id, full_name, email, doc_type, status, expires_at, days_to_expiry",
    )
    .order("days_to_expiry", { ascending: true, nullsFirst: false })
    .limit(500);
  if (
    filterType !== "all" &&
    (COMPLIANCE_DOC_TYPES as readonly string[]).includes(filterType)
  ) {
    q = q.eq("doc_type", filterType);
  }
  const { data } = await q;
  const alerts = (data ?? []) as Alert[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Compliance</h1>
        <p className="text-sm text-slate-500 mt-1">
          Caregivers with expiring or expired documents. Daily sweep at{" "}
          <code className="text-[11px]">/api/cron/compliance-sweep</code>{" "}
          flips verified → expired when the date passes.
        </p>
      </div>

      <div className="grid sm:grid-cols-5 gap-3">
        <Card label="Pending" value={pending.count ?? 0} tone="amber" />
        <Card label="Verified" value={verified.count ?? 0} tone="emerald" />
        <Card
          label="Expiring ≤30d"
          value={expiring.count ?? 0}
          tone="amber"
        />
        <Card label="Expired" value={expired.count ?? 0} tone="rose" />
        <Card label="Rejected" value={rejected.count ?? 0} tone="slate" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/admin/compliance"
          className={`text-xs px-3 py-1.5 rounded-full border ${
            filterType === "all"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200"
          }`}
        >
          All types
        </Link>
        {COMPLIANCE_DOC_TYPES.map((t) => (
          <Link
            key={t}
            href={`/admin/compliance?doc_type=${t}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              filterType === t
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {COMPLIANCE_DOC_TYPE_LABEL[t]}
          </Link>
        ))}
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No expiring or expired documents in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">Caregiver</th>
                <th className="text-left px-4 py-2.5">Doc</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Expires</th>
                <th className="text-left px-4 py-2.5">Days</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.document_id}
                  className="border-t border-slate-100"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {a.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-slate-500">{a.email ?? ""}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {COMPLIANCE_DOC_TYPE_LABEL[a.doc_type]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_TONE[a.status] ?? STATUS_TONE.pending}`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {a.expires_at
                      ? new Date(a.expires_at).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.days_to_expiry == null ? (
                      <span className="text-slate-400">—</span>
                    ) : a.days_to_expiry < 0 ? (
                      <span className="text-rose-700 font-semibold">
                        {Math.abs(a.days_to_expiry)} days overdue
                      </span>
                    ) : (
                      <span className="text-slate-700">
                        {a.days_to_expiry} days
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "rose" | "slate";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-50 border-amber-200"
      : tone === "emerald"
        ? "bg-emerald-50 border-emerald-200"
        : tone === "rose"
          ? "bg-rose-50 border-rose-200"
          : "bg-slate-50 border-slate-200";
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
