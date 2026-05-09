import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import RefRowActions from "./RefRowActions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  carer_id: string;
  referee_name: string;
  referee_email: string;
  relationship: string | null;
  status: string;
  rating: number | null;
  recommend: boolean | null;
  comment: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  rejected_reason: string | null;
  created_at: string;
};

export default async function ReferencesQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = sp.filter ?? "submitted";
  const admin = createAdminClient();
  let q = admin
    .from("carer_references")
    .select(
      "id, carer_id, referee_name, referee_email, relationship, status, rating, recommend, comment, submitted_at, verified_at, rejected_reason, created_at",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (filter !== "all") {
    q = q.eq("status", filter);
  }
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Carer references
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Submitted references awaiting verification.
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
        {["submitted", "verified", "rejected", "expired", "all"].map((f) => (
          <Link
            key={f}
            href={`/admin/trust-safety/references?filter=${f}`}
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
                  {r.referee_name}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    {r.relationship ? `· ${r.relationship}` : ""}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  {r.referee_email} · for carer {r.carer_id.slice(0, 8)}…
                </p>
                {r.rating != null && (
                  <p className="text-xs text-slate-500 mt-1">
                    Rated {r.rating}/5
                    {r.recommend === true ? " · would recommend" : ""}
                    {r.recommend === false ? " · would NOT recommend" : ""}
                  </p>
                )}
                {r.comment && (
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                    {r.comment}
                  </p>
                )}
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full border bg-slate-50 border-slate-200 font-semibold">
                {r.status}
              </span>
            </div>
            {r.status === "submitted" && (
              <div className="mt-3">
                <RefRowActions id={r.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
