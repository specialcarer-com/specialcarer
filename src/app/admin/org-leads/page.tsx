import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import LeadRowActions from "./LeadRowActions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  created_at: string;
  full_name: string | null;
  work_email: string;
  org_name: string | null;
  role: string | null;
  message: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  contacted_at: string | null;
  converted_to_org_id: string | null;
};

const STATUS_TONE: Record<string, string> = {
  new: "bg-amber-50 text-amber-800 border-amber-200",
  contacted: "bg-sky-50 text-sky-800 border-sky-200",
  qualified: "bg-emerald-50 text-emerald-800 border-emerald-200",
  disqualified: "bg-slate-100 text-slate-600 border-slate-200",
  converted: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export default async function AdminOrgLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = sp.filter ?? "new";
  const admin = createAdminClient();
  let q = admin
    .from("org_leads")
    .select(
      "id, created_at, full_name, work_email, org_name, role, message, source, status, notes, contacted_at, converted_to_org_id",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") q = q.eq("status", filter);
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Organisation leads
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Captured from /organisations#contact and any other marketing CTAs.
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
        {["new", "contacted", "qualified", "disqualified", "converted", "all"].map(
          (f) => (
            <Link
              key={f}
              href={`/admin/org-leads?filter=${f}`}
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
                  {r.org_name ?? r.full_name ?? r.work_email}
                </p>
                <p className="text-xs text-slate-500">
                  {r.full_name ?? "—"} · {r.role ?? "—"} ·{" "}
                  {new Date(r.created_at).toLocaleString("en-GB")} ·{" "}
                  {r.source ?? "organisations_page"}
                </p>
                <p className="text-xs text-slate-500">{r.work_email}</p>
                {r.message && (
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                    {r.message}
                  </p>
                )}
                {r.notes && (
                  <p className="text-xs text-emerald-700 mt-2 whitespace-pre-wrap">
                    Note: {r.notes}
                  </p>
                )}
              </div>
              <span
                className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${STATUS_TONE[r.status] ?? STATUS_TONE.new}`}
              >
                {r.status}
              </span>
            </div>
            <div className="mt-3">
              <LeadRowActions
                id={r.id}
                currentStatus={r.status}
                initialNotes={r.notes ?? ""}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
