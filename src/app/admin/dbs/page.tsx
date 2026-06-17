import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDbsEnabled } from "@/lib/dbs/flag";
import { US_REGION_ENABLED } from "@/lib/region";
import DbsQueueClient, { type DbsQueueRow } from "./DbsQueueClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "DBS applications — Admin" };

type AppRow = {
  id: string;
  carer_id: string;
  kind: "adult" | "child";
  status: string;
  vendor: string | null;
  vendor_reference: string | null;
  submitted_at: string | null;
  recovery_status: string | null;
  created_at: string;
};

export default async function AdminDbsPage() {
  await requireAdmin();

  if (!isDbsEnabled()) {
    return (
      <div className="space-y-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <h1 className="text-2xl font-semibold text-slate-900">DBS applications</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          DBS verification is currently disabled. Set
          <code className="mx-1 rounded bg-amber-100 px-1">NEXT_PUBLIC_DBS_ENABLED=true</code>
          to enable the queue.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  // UK-only regional constraint until the US launch (see @/lib/region). Filter
  // the queue to GB carers via an inner join on caregiver_profiles.country so
  // no US applications surface in the admin queue.
  let appsQuery = admin
    .from("dbs_applications")
    .select(
      "id, carer_id, kind, status, vendor, vendor_reference, submitted_at, recovery_status, created_at, caregiver_profiles!inner(country)",
    )
    .in("status", ["submitted", "in_progress"]);
  if (!US_REGION_ENABLED) {
    appsQuery = appsQuery.eq("caregiver_profiles.country", "GB");
  }
  const { data: apps } = await appsQuery
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(300);

  const list = (apps ?? []) as AppRow[];
  const carerIds = Array.from(new Set(list.map((a) => a.carer_id)));
  let carers: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
  if (carerIds.length > 0) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", carerIds);
    carers = (data ?? []) as typeof carers;
  }
  const carerById = new Map(carers.map((c) => [c.id, c]));

  const rows: DbsQueueRow[] = list.map((a) => ({
    id: a.id,
    carer_id: a.carer_id,
    carer_name: carerById.get(a.carer_id)?.full_name ?? "Unknown carer",
    avatar_url: carerById.get(a.carer_id)?.avatar_url ?? null,
    kind: a.kind,
    status: a.status,
    vendor: a.vendor,
    vendor_reference: a.vendor_reference,
    submitted_at: a.submitted_at,
    recovery_status: a.recovery_status,
    created_at: a.created_at,
  }));

  return (
    <div className="space-y-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">DBS applications</h1>
          <p className="text-sm text-slate-500 mt-1">
            Applications awaiting a manual decision (submitted / in progress).
            Open one to approve or reject.
          </p>
        </div>
        <Link
          href="/admin/dbs-changes/queue"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Update Service change queue →
        </Link>
      </div>
      <DbsQueueClient initialRows={rows} />
    </div>
  );
}
