import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import TimesheetResolveDrawer from "./_components/TimesheetResolveDrawer";

export const dynamic = "force-dynamic";

type Tab = "overage_stale" | "disputed" | "flagged";

const TAB_LABEL: Record<Tab, string> = {
  overage_stale: "Overage pending >7d",
  disputed: "Disputed",
  flagged: "Flagged forced check-in/out",
};

function fmtMoney(cents: number, currency: string) {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtDuration(min: number): string {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TsListRow = {
  id: string;
  booking_id: string;
  carer_id: string;
  booking_source: string;
  submitted_at: string;
  actual_minutes: number;
  booked_minutes: number;
  overage_minutes: number;
  overage_cents: number;
  overage_requires_approval: boolean;
  overage_cap_reason: string | null;
  status: string;
  dispute_reason: string | null;
  dispute_opened_at: string | null;
  forced_check_in: boolean;
  forced_check_out: boolean;
  currency: string;
};

export default async function AdminTimesheetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; open?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const tab: Tab =
    sp.tab === "disputed"
      ? "disputed"
      : sp.tab === "flagged"
      ? "flagged"
      : "overage_stale";
  const openId = sp.open ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (!profile || profile.role !== "admin") redirect("/");

  let rows: TsListRow[] = [];

  if (tab === "overage_stale") {
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 3600 * 1000,
    ).toISOString();
    const { data } = await admin
      .from("shift_timesheets")
      .select(
        "id, booking_id, carer_id, booking_source, submitted_at, actual_minutes, booked_minutes, overage_minutes, overage_cents, overage_requires_approval, overage_cap_reason, status, dispute_reason, dispute_opened_at, forced_check_in, forced_check_out, currency",
      )
      .eq("status", "pending_approval")
      .eq("overage_requires_approval", true)
      .lt("submitted_at", sevenDaysAgo)
      .order("submitted_at", { ascending: true })
      .limit(200);
    rows = (data ?? []) as TsListRow[];
  } else if (tab === "disputed") {
    const { data } = await admin
      .from("shift_timesheets")
      .select(
        "id, booking_id, carer_id, booking_source, submitted_at, actual_minutes, booked_minutes, overage_minutes, overage_cents, overage_requires_approval, overage_cap_reason, status, dispute_reason, dispute_opened_at, forced_check_in, forced_check_out, currency",
      )
      .eq("status", "disputed")
      .order("dispute_opened_at", { ascending: true })
      .limit(200);
    rows = (data ?? []) as TsListRow[];
  } else {
    // flagged — timesheets whose booking has flagged_for_review.
    const { data: flaggedBookings } = await admin
      .from("bookings")
      .select("id")
      .eq("flagged_for_review", true)
      .order("updated_at", { ascending: false })
      .limit(200);
    const flaggedIds = ((flaggedBookings ?? []) as { id: string }[]).map(
      (b) => b.id,
    );
    if (flaggedIds.length > 0) {
      const { data } = await admin
        .from("shift_timesheets")
        .select(
          "id, booking_id, carer_id, booking_source, submitted_at, actual_minutes, booked_minutes, overage_minutes, overage_cents, overage_requires_approval, overage_cap_reason, status, dispute_reason, dispute_opened_at, forced_check_in, forced_check_out, currency",
        )
        .in("booking_id", flaggedIds)
        .order("submitted_at", { ascending: false })
        .limit(200);
      rows = (data ?? []) as TsListRow[];
    }
  }

  const openRow = openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Timesheets</h1>
          <p className="text-sm text-slate-500 mt-1">
            Approval queue. Disputes have a 72h SLA. Forced check-in/out
            bookings are surfaced here for review.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to admin
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {(["overage_stale", "disputed", "flagged"] as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/admin/timesheets?tab=${t}`}
            className={`px-4 py-2 -mb-px border-b-2 text-sm font-semibold ${
              tab === t
                ? "border-[#0E7C7B] text-[#0E7C7B]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No timesheets in this tab.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Actual / booked</th>
                <th className="px-4 py-3">Overage</th>
                <th className="px-4 py-3">Forced</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {r.booking_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.booking_source}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {fmtDateTime(r.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {fmtDuration(r.actual_minutes)} /{" "}
                    {fmtDuration(r.booked_minutes)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.overage_minutes > 0
                      ? `${fmtDuration(r.overage_minutes)} · ${fmtMoney(r.overage_cents, r.currency)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.forced_check_in && "in"}
                    {r.forced_check_in && r.forced_check_out && " · "}
                    {r.forced_check_out && "out"}
                    {!r.forced_check_in && !r.forced_check_out && "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 ${
                        r.status === "disputed"
                          ? "bg-rose-100 text-rose-800"
                          : r.status === "pending_approval"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-right">
                    <Link
                      href={`/admin/timesheets?tab=${tab}&open=${r.id}`}
                      className="text-[#0E7C7B] font-semibold hover:underline"
                    >
                      Resolve
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openRow && (
        <TimesheetResolveDrawer
          timesheet={openRow}
          backHref={`/admin/timesheets?tab=${tab}`}
        />
      )}
    </div>
  );
}
