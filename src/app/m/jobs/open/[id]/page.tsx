import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "../../../_components/ui";
import OpenJobClient from "./OpenJobClient";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  seeker_id: string;
  service_type: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  location_city: string | null;
  location_country: string | null;
  notes: string | null;
  status: string;
  expires_at: string;
  claimed_by: string | null;
  booking_id: string | null;
};

function firstName(full: string | null | undefined): string {
  if (!full) return "S.";
  const t = full.trim();
  if (!t) return "S.";
  const f = t.split(/\s+/)[0];
  return `${f.slice(0, 1).toUpperCase()}.`;
}

export default async function OpenJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/m/login?redirect=/m/jobs/open/${id}`);

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("service_requests")
    .select(
      "id, seeker_id, service_type, starts_at, ends_at, hours, hourly_rate_cents, currency, location_city, location_country, notes, status, expires_at, claimed_by, booking_id",
    )
    .eq("id", id)
    .maybeSingle<RequestRow>();
  if (!row) notFound();

  // If this carer already claimed it, jump straight to the booking.
  if (row.status === "claimed" && row.claimed_by === user.id && row.booking_id) {
    redirect(`/m/jobs/${row.booking_id}`);
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", row.seeker_id)
    .maybeSingle<{ full_name: string | null }>();

  return (
    <div className="min-h-screen bg-bg-screen pb-24">
      <TopBar title="Open request" back="/m/jobs" />
      <OpenJobClient
        request={{
          id: row.id,
          service_type: row.service_type,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          hours: Number(row.hours),
          hourly_rate_cents: row.hourly_rate_cents,
          currency: row.currency,
          location_city: row.location_city,
          location_country: row.location_country,
          notes: row.notes,
          status: row.status,
          expires_at: row.expires_at,
        }}
        anonClientName={firstName(prof?.full_name ?? null)}
      />
    </div>
  );
}
