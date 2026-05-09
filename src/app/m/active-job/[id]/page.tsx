import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "../../_components/ui";
import ActiveJobClient from "./ActiveJobClient";

export const dynamic = "force-dynamic";

/**
 * Carer-side live shift screen. Server-renders the auth + booking-row
 * gate, then hands the carer's view to ActiveJobClient. The client
 * component handles the three phases (check-in / active / summary)
 * by reading status from the live `/api/m/active-job/[id]` endpoint.
 */
export default async function ActiveJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/m/login?redirect=/m/active-job/${id}`);

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, caregiver_id, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      caregiver_id: string | null;
      status: string;
    }>();
  if (!booking) notFound();
  if (booking.caregiver_id !== user.id) {
    redirect("/m/jobs");
  }

  return (
    <div className="min-h-screen bg-bg-screen">
      <TopBar title="Active job" back={`/m/jobs/${id}`} />
      <ActiveJobClient bookingId={id} />
    </div>
  );
}
