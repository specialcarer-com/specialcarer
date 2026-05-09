import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TAX_DOC_TYPES,
  type TaxDocStatus,
  type TaxDocType,
} from "@/lib/admin-ops/types";
import FinanceTabs from "../_tabs";
import TaxDocActions from "./TaxDocActions";
import GenerateButton from "./GenerateButton";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  user_id: string;
  doc_type: TaxDocType;
  tax_year: number;
  file_url: string | null;
  generated_at: string | null;
  sent_at: string | null;
  status: TaxDocStatus;
};

const STATUS_TONE: Record<TaxDocStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  ready: "bg-sky-50 text-sky-800 border-sky-200",
  sent: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amended: "bg-amber-50 text-amber-800 border-amber-200",
};

export default async function TaxDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ tax_year?: string; doc_type?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const taxYearFilter = sp.tax_year ?? "all";
  const docTypeFilter = sp.doc_type ?? "all";

  const admin = createAdminClient();
  let q = admin
    .from("tax_documents")
    .select(
      "id, user_id, doc_type, tax_year, file_url, generated_at, sent_at, status",
    )
    .order("tax_year", { ascending: false })
    .order("generated_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (taxYearFilter !== "all") {
    const n = Number(taxYearFilter);
    if (Number.isInteger(n)) q = q.eq("tax_year", n);
  }
  if (
    docTypeFilter !== "all" &&
    (TAX_DOC_TYPES as readonly string[]).includes(docTypeFilter)
  ) {
    q = q.eq("doc_type", docTypeFilter);
  }
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  // Resolve user names (best-effort).
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  let nameById = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    nameById = new Map(
      (profs ?? []).map((p) => [
        p.id as string,
        (p.full_name ?? null) as string | null,
      ]),
    );
  }

  // Year list = current ± 4
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      <FinanceTabs active="/admin/finance/tax-docs" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Tax documents
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            US 1099 / UK P60 / P11D / self-assessment-summary stubs. The
            generate-stub button creates a draft row; real PDF generation is
            handled out-of-band.
          </p>
        </div>
        <GenerateButton defaultYear={currentYear} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-1">
            Year
          </span>
          <Link
            href={`/admin/finance/tax-docs?doc_type=${docTypeFilter}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              taxYearFilter === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            all
          </Link>
          {years.map((y) => (
            <Link
              key={y}
              href={`/admin/finance/tax-docs?tax_year=${y}&doc_type=${docTypeFilter}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                taxYearFilter === String(y)
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-1">
            Type
          </span>
          <Link
            href={`/admin/finance/tax-docs?tax_year=${taxYearFilter}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              docTypeFilter === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            all
          </Link>
          {TAX_DOC_TYPES.map((t) => (
            <Link
              key={t}
              href={`/admin/finance/tax-docs?tax_year=${taxYearFilter}&doc_type=${t}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                docTypeFilter === t
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No tax documents in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">User</th>
                <th className="text-left px-4 py-2.5">Doc type</th>
                <th className="text-left px-4 py-2.5">Year</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Generated</th>
                <th className="text-left px-4 py-2.5">Sent</th>
                <th className="text-left px-4 py-2.5">File</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {nameById.get(r.user_id) ?? r.user_id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {r.user_id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.doc_type}</td>
                  <td className="px-4 py-3 text-slate-700">{r.tax_year}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_TONE[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.generated_at
                      ? new Date(r.generated_at).toLocaleString("en-GB")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.sent_at
                      ? new Date(r.sent_at).toLocaleString("en-GB")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.file_url ? (
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        View →
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TaxDocActions docId={r.id} current={r.status} />
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
