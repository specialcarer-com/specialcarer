import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  LEAVE_REQUEST_REASON_LABEL,
  LEAVE_REQUEST_STATUSES,
  type LeaveRequest,
} from "@/lib/safety/types";
import LeaveRequestRowActions from "./LeaveRequestRowActions";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  open: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  denied: "bg-rose-50 text-rose-800 border-rose-200",
  withdrawn: "bg-slate-100 text-slate-700 border-slate-200",
};

export default async function AdminLeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "open";

  const admin = createAdminClient();
  let q = admin
    .from("leave_requests")
    .select(
      "id, carer_user_id, booking_id, reason, description, replacement_needed, status, admin_notes, resolved_by, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (
    status !== "all" &&
    (LEAVE_REQUEST_STATUSES as readonly string[]).includes(status)
  ) {
    q = q.eq("status", status);
  }
  const { data } = await q;
  const list = (data ?? []) as LeaveRequest[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Leave requests
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Carers asking to leave a live booking. Approve or deny; arrange a
          replacement when needed.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["open", "approved", "denied", "withdrawn", "all"] as const).map(
          (s) => (
            <Link
              key={s}
              href={`/admin/trust-safety/leave-requests?status=${s}`}
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

      {list.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No leave requests in this filter.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl bg-white border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {LEAVE_REQUEST_REASON_LABEL[r.reason]}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(r.created_at).toLocaleString("en-GB")} · Carer{" "}
                    {r.carer_user_id.slice(0, 8)} · Booking{" "}
                    <Link
                      href={`/dashboard/bookings/${r.booking_id}`}
                      className="text-teal-700 hover:underline"
                    >
                      {r.booking_id.slice(0, 8)}
                    </Link>
                    {r.replacement_needed && " · Replacement needed"}
                  </p>
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                    {r.description}
                  </p>
                  {r.admin_notes && (
                    <p className="mt-2 rounded-md bg-slate-50 border border-slate-200 p-2 text-xs text-slate-700">
                      <span className="font-semibold">Notes:</span>{" "}
                      {r.admin_notes}
                    </p>
                  )}
                  <LeaveRequestRowActions
                    requestId={r.id}
                    initialStatus={r.status}
                    initialNotes={r.admin_notes}
                  />
                </div>
                <span
                  className={`shrink-0 text-[11px] px-2 py-1 rounded-full border font-semibold ${TONE[r.status] ?? TONE.open}`}
                >
                  {r.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-4">
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; Safety
        </Link>
      </div>
    </div>
  );
}
