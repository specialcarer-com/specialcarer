import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import ChildOptInQueueClient from "./ChildOptInQueueClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Child-population opt-ins — Admin" };

type Row = {
  id: string;
  full_name: string | null;
  country: string | null;
  works_with_adults: boolean;
  works_with_children: boolean;
  works_with_children_admin_approved_at: string | null;
  agency_opt_in_status: string;
};

export default async function ChildOptInQueuePage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select(
      "id, full_name, country, works_with_adults, works_with_children, works_with_children_admin_approved_at, agency_opt_in_status",
    )
    .eq("role", "caregiver")
    .eq("works_with_children", true)
    .is("works_with_children_admin_approved_at", null)
    .order("full_name", { ascending: true });

  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Child-population opt-ins
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Carers requesting to work with children. Approve only after verifying
            additional safeguarding requirements.
          </p>
        </div>
        <Link
          href="/admin/agency-optin"
          className="text-sm font-semibold text-[#0E7C7B] underline"
        >
          ← Main opt-in queue
        </Link>
      </div>

      <ChildOptInQueueClient rows={rows} />
    </div>
  );
}
