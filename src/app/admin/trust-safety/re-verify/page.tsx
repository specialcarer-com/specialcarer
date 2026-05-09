import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import ReverifyRowActions from "./RowActions";

export const dynamic = "force-dynamic";

type ReverifyRow = {
  background_check_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  check_type: string | null;
  vendor: string | null;
  check_status: string | null;
  issued_at: string | null;
  expires_at: string | null;
  next_reverify_at: string | null;
  reverify_cadence_months: number;
  reverify_status: string;
  due_in_days: number | null;
};

const STATUS_TONE: Record<string, string> = {
  none: "bg-slate-100 text-slate-700 border-slate-200",
  due: "bg-amber-50 text-amber-800 border-amber-200",
  overdue: "bg-rose-50 text-rose-800 border-rose-200",
  in_progress: "bg-sky-50 text-sky-800 border-sky-200",
  cleared: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export default async function ReverifyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "due";

  const admin = createAdminClient();
  let q = admin
    .from("reverify_queue_v")
    .select(
      "background_check_id, user_id, full_name, email, check_type, vendor, check_status, issued_at, expires_at, next_reverify_at, reverify_cadence_months, reverify_status, due_in_days",
    )
    .order("due_in_days", { ascending: true, nullsFirst: false })
    .limit(500);
  if (status !== "all") q = q.eq("reverify_status", status);
  const { data } = await q;
  const rows = (data ?? []) as ReverifyRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          ID re-verification
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Caregivers whose ID / DBS / Checkr cycle is approaching renewal.
          Default cadence is 12 months — admins can request a fresh check,
          mark a renewal cleared, or snooze for 14 days.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["due", "overdue", "in_progress", "cleared", "none", "all"] as const).map(
          (s) => (
            <Link
              key={s}
              href={`/admin/trust-safety/re-verify?status=${s}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                status === s
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              {s}
            </Link>
          ),
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No background-checks in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">Caregiver</th>
                <th className="text-left px-4 py-2.5">Check</th>
                <th className="text-left px-4 py-2.5">Last verified</th>
                <th className="text-left px-4 py-2.5">Due in</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.background_check_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {r.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-slate-500">{r.email ?? ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700">{r.check_type ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      {r.vendor ?? ""}{" "}
                      {r.check_status ? `· ${r.check_status}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.issued_at
                      ? new Date(r.issued_at).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.due_in_days == null
                      ? "—"
                      : r.due_in_days < 0
                        ? `${Math.abs(r.due_in_days)} days overdue`
                        : `${r.due_in_days} days`}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_TONE[r.reverify_status] ?? STATUS_TONE.none}`}
                    >
                      {r.reverify_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ReverifyRowActions
                      backgroundCheckId={r.background_check_id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Daily sweep runs from /api/cron/reverify-sweep, flipping `none → due`
        within 14 days and `due → overdue` once `next_reverify_at` passes.
      </p>
    </div>
  );
}
