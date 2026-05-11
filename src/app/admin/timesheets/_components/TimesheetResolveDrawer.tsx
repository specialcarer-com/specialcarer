"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Timesheet = {
  id: string;
  booking_id: string;
  booking_source: string;
  actual_minutes: number;
  booked_minutes: number;
  overage_minutes: number;
  overage_cents: number;
  overage_requires_approval: boolean;
  status: string;
  dispute_reason: string | null;
  forced_check_in: boolean;
  forced_check_out: boolean;
  currency: string;
};

type Resolution = "accept_carer" | "accept_seeker" | "partial";

/**
 * Side drawer for `/admin/timesheets?open=<id>`. Posts to the admin
 * resolve endpoint, then router.refresh()es the list.
 */
export default function TimesheetResolveDrawer({
  timesheet,
  backHref,
}: {
  timesheet: Timesheet;
  backHref: string;
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState<Resolution>("accept_carer");
  const [override, setOverride] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (notes.trim().length < 5) {
      setErr("Admin notes must be at least 5 characters.");
      return;
    }
    if (resolution === "partial" && (override === "" || Number(override) <= 0)) {
      setErr("Provide override_actual_minutes for a partial resolution.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        resolution,
        admin_notes: notes.trim(),
      };
      if (resolution === "partial") {
        body.override_actual_minutes = Number(override);
      }
      const res = await fetch(`/api/admin/timesheets/${timesheet.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't resolve.");
        setBusy(false);
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setErr("Network error.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end">
      <div className="w-full sm:max-w-lg max-h-[100dvh] overflow-y-auto bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold text-slate-900">
            Resolve timesheet
          </p>
          <Link
            href={backHref}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Close
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 p-3 text-sm space-y-1">
          <p>
            Booking: <span className="font-mono">{timesheet.booking_id.slice(0, 8)}</span>
          </p>
          <p>Source: {timesheet.booking_source}</p>
          <p>
            Times: {timesheet.actual_minutes}m actual / {timesheet.booked_minutes}m booked
          </p>
          <p>
            Overage: {timesheet.overage_minutes}m,{" "}
            {timesheet.overage_cents} cents{" "}
            {timesheet.overage_requires_approval ? "(threshold breached)" : ""}
          </p>
          <p>
            Forced check-in: {timesheet.forced_check_in ? "yes" : "no"} · forced
            check-out: {timesheet.forced_check_out ? "yes" : "no"}
          </p>
          {timesheet.dispute_reason && (
            <p className="text-rose-700">
              Dispute: {timesheet.dispute_reason}
            </p>
          )}
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Resolution
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as Resolution)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2"
          >
            <option value="accept_carer">Accept carer&rsquo;s timesheet</option>
            <option value="accept_seeker">
              Accept seeker&rsquo;s position (booked only, release overage)
            </option>
            <option value="partial">Partial override</option>
          </select>
        </label>

        {resolution === "partial" && (
          <label className="block text-sm font-medium text-slate-700">
            Override actual_minutes
            <input
              type="number"
              min="1"
              value={override}
              onChange={(e) =>
                setOverride(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 p-2"
            />
          </label>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Admin notes (visible on the timesheet record)
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2"
          />
        </label>

        {err && <p className="text-sm text-rose-700">{err}</p>}

        <div className="flex gap-2">
          <Link
            href={backHref}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-center font-semibold text-slate-700"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-lg px-4 py-2 font-semibold text-white"
            style={{ backgroundColor: "#0E7C7B" }}
          >
            {busy ? "Resolving…" : "Resolve"}
          </button>
        </div>
      </div>
    </div>
  );
}
