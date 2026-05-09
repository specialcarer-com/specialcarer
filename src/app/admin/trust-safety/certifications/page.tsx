import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CERT_TYPE_LABEL } from "@/lib/vetting/types";
import CertRowActions from "./CertRowActions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  carer_id: string;
  cert_type: string;
  issuer: string | null;
  issued_at: string | null;
  expires_at: string | null;
  file_path: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  signed_url?: string | null;
};

export default async function CertsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = sp.filter ?? "pending";
  const admin = createAdminClient();
  let q = admin
    .from("carer_certifications")
    .select(
      "id, carer_id, cert_type, issuer, issued_at, expires_at, file_path, status, rejection_reason, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") q = q.eq("status", filter);
  const { data } = await q;
  const baseRows = (data ?? []) as Row[];

  // Sign URLs for the file previews. Best-effort: 1h.
  const rows: Row[] = await Promise.all(
    baseRows.map(async (r) => {
      if (!r.file_path) return r;
      const { data: signed } = await admin.storage
        .from("certifications")
        .createSignedUrl(r.file_path, 3600);
      return { ...r, signed_url: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Carer certifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review uploaded certificates and verify or reject.
          </p>
        </div>
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; safety
        </Link>
      </div>

      <div className="flex gap-2 text-xs">
        {["pending", "verified", "rejected", "expired", "all"].map((f) => (
          <Link
            key={f}
            href={`/admin/trust-safety/certifications?filter=${f}`}
            className={`px-3 py-1.5 rounded-full border ${
              filter === f
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {f}
          </Link>
        ))}
      </div>

      <ul className="space-y-3">
        {rows.length === 0 && (
          <li className="text-sm text-slate-500">Nothing in this queue.</li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl bg-white border border-slate-200 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {CERT_TYPE_LABEL[r.cert_type] ?? r.cert_type}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    · carer {r.carer_id.slice(0, 8)}…
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  {r.issuer ?? "—"}
                  {r.issued_at ? ` · issued ${r.issued_at}` : ""}
                  {r.expires_at ? ` · expires ${r.expires_at}` : ""}
                </p>
                {r.signed_url && (
                  <a
                    href={r.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-slate-900 underline mt-1 inline-block"
                  >
                    Open file →
                  </a>
                )}
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full border bg-slate-50 border-slate-200 font-semibold">
                {r.status}
              </span>
            </div>
            {r.status === "pending" && (
              <div className="mt-3">
                <CertRowActions id={r.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
