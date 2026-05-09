import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  legal_name: string | null;
  country: string | null;
  org_type: string | null;
  verification_status: string;
  submitted_at: string | null;
  created_at: string;
  free_email_override: boolean;
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  verified: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
  suspended: "bg-rose-50 text-rose-800 border-rose-200",
};

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = sp.filter ?? "pending";
  const admin = createAdminClient();
  let q = admin
    .from("organizations")
    .select(
      "id, legal_name, country, org_type, verification_status, submitted_at, created_at, free_email_override",
    )
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(200);
  if (filter !== "all") {
    q = q.eq("verification_status", filter);
  }
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Organisations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Verify orgs before they can book carers. Oldest pending first.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to admin
        </Link>
      </div>

      <div className="flex gap-2 text-xs flex-wrap">
        {["pending", "verified", "rejected", "suspended", "draft", "all"].map(
          (f) => (
            <Link
              key={f}
              href={`/admin/orgs?filter=${f}`}
              className={`px-3 py-1.5 rounded-full border ${
                filter === f
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              {f}
            </Link>
          ),
        )}
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
                <p className="font-semibold text-slate-900 truncate">
                  {r.legal_name ?? "(no legal name)"}
                </p>
                <p className="text-xs text-slate-500">
                  {r.country ?? "?"} · {r.org_type ?? "?"} ·{" "}
                  {r.submitted_at
                    ? `Submitted ${new Date(r.submitted_at).toLocaleString("en-GB")}`
                    : `Started ${new Date(r.created_at).toLocaleDateString("en-GB")}`}
                </p>
                {r.free_email_override && (
                  <p className="text-xs text-amber-700 mt-1">
                    ⚠ Free-webmail booker — strict review
                  </p>
                )}
              </div>
              <span
                className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${STATUS_TONE[r.verification_status] ?? STATUS_TONE.draft}`}
              >
                {r.verification_status}
              </span>
              <Link
                href={`/admin/orgs/${r.id}`}
                className="text-sm font-semibold text-slate-900 hover:underline"
              >
                Open →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
