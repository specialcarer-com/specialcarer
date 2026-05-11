import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import AgencyOptInAdminClient from "./AgencyOptInAdminClient";
import type { GatesRow } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agency opt-in — Admin" };

const TABS = [
  { key: "ready_for_review", label: "Pending review" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "rejected", label: "Rejected" },
  { key: "in_progress", label: "In progress" },
] as const;

type Row = GatesRow & {
  full_name: string | null;
  country: string | null;
};

export default async function AdminAgencyOptInPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = (sp.tab ?? "ready_for_review") as (typeof TABS)[number]["key"];

  const admin = createAdminClient();
  const { data: gates } = await admin
    .from("v_agency_opt_in_gates")
    .select("*")
    .eq("agency_opt_in_status", tab)
    .order("agency_opt_in_submitted_at", {
      ascending: true,
      nullsFirst: false,
    });

  const userIds = (gates ?? []).map((g: { user_id: string }) => g.user_id);
  let profiles: { id: string; full_name: string | null; country: string | null }[] = [];
  if (userIds.length > 0) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, country")
      .in("id", userIds);
    profiles = (data ?? []) as typeof profiles;
  }
  const profById = new Map(profiles.map((p) => [p.id, p]));
  const rows: Row[] = (gates ?? []).map((g: GatesRow) => ({
    ...g,
    full_name: profById.get(g.user_id)?.full_name ?? null,
    country: profById.get(g.user_id)?.country ?? null,
  }));

  return (
    <div
      className="space-y-6"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Agency opt-in queue</h1>
        <p className="text-sm text-slate-500 mt-1">
          Channel B carer enrolment. One-click approve once all four gates pass.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/agency-optin?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 ${
              tab === t.key
                ? "border-[#0E7C7B] text-[#0E7C7B] bg-[#E9F4F4]"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <AgencyOptInAdminClient tab={tab} rows={rows} />
    </div>
  );
}
