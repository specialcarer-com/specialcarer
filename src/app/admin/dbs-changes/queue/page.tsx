import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import DbsChangeQueueClient from "./DbsChangeQueueClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "DBS change queue — Admin" };

type EventRow = {
  id: string;
  carer_id: string;
  detected_at: string;
  source: string;
  prior_status: string | null;
  new_status: string | null;
  raw_payload: unknown;
};

export default async function DbsChangeQueuePage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: events } = await admin
    .from("dbs_change_events")
    .select(
      "id, carer_id, detected_at, source, prior_status, new_status, raw_payload",
    )
    .is("admin_reviewed_at", null)
    .order("detected_at", { ascending: false })
    .limit(200);

  const carerIds = Array.from(
    new Set((events ?? []).map((e: EventRow) => e.carer_id)),
  );
  let carers: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
  if (carerIds.length > 0) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", carerIds);
    carers = (data ?? []) as typeof carers;
  }
  const carerById = new Map(carers.map((c) => [c.id, c]));
  const rows = (events ?? []).map((e: EventRow) => ({
    ...e,
    carer_name: carerById.get(e.carer_id)?.full_name ?? "Unknown carer",
    avatar_url: carerById.get(e.carer_id)?.avatar_url ?? null,
  }));

  return (
    <div className="space-y-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">DBS change queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Carers whose Update Service status changed or whose details were
            submitted for manual verification. Action each item.
          </p>
        </div>
        <Link
          href="/admin/agency-optin"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Agency opt-in queue →
        </Link>
      </div>
      <DbsChangeQueueClient initialRows={rows} />
    </div>
  );
}
