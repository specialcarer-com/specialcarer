import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicToken, getStyle } from "@/lib/mapbox/server";
import Link from "next/link";
import { TopBar } from "../../_components/ui";
import TargetedJobClient from "./TargetedJobClient";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/safety/types";

export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  seeker_id: string;
  caregiver_id: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  service_type: string;
  location_city: string | null;
  location_country: string | null;
  location_postcode: string | null;
  notes: string | null;
  discovery_expires_at: string | null;
  accepted_at: string | null;
};

function partialPostcode(pc: string | null | undefined): string | null {
  if (!pc) return null;
  const t = pc.trim().toUpperCase();
  if (t.includes(" ")) return t.split(" ")[0];
  if (/^\d{5}/.test(t)) return t.slice(0, 3);
  return t.slice(0, 3);
}

function firstName(full: string | null | undefined): string {
  if (!full) return "Client";
  const t = full.trim();
  if (!t) return "Client";
  return t.split(/\s+/)[0];
}

/**
 * Carer-facing detail view for a booking targeted at this carer.
 *
 * Permission: only the assigned caregiver may open this page; anyone
 * else gets bounced back to the feed. (Seekers have their own
 * /dashboard/bookings/[id] view; family viewers use /m/track.)
 */
export default async function TargetedJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/m/login?redirect=/m/jobs/${id}`);

  const admin = createAdminClient();
  const { data: bookingRaw } = await admin
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, hourly_rate_cents, currency, service_type, location_city, location_country, location_postcode, notes, discovery_expires_at, accepted_at",
    )
    .eq("id", id)
    .maybeSingle<BookingRow>();
  if (!bookingRaw) notFound();
  if (bookingRaw.caregiver_id !== user.id) {
    redirect("/m/jobs");
  }

  // Best-effort service-point coords (for the small map preview).
  let lng: number | null = null;
  let lat: number | null = null;
  try {
    const { data: pt } = await admin.rpc("booking_service_point_lnglat", {
      p_booking_id: id,
    });
    const row =
      Array.isArray(pt) && pt.length > 0
        ? (pt[0] as { lng: number; lat: number })
        : null;
    if (row && Number.isFinite(row.lng) && Number.isFinite(row.lat)) {
      lng = row.lng;
      lat = row.lat;
    }
  } catch {
    /* helper RPC may not be present in older envs */
  }

  const [{ data: prof }, { data: pref }] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name")
      .eq("id", bookingRaw.seeker_id)
      .maybeSingle<{ full_name: string | null }>(),
    admin
      .from("carer_preferred_clients")
      .select("carer_id")
      .eq("carer_id", user.id)
      .eq("seeker_id", bookingRaw.seeker_id)
      .maybeSingle<{ carer_id: string }>(),
  ]);

  const isActive = (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(
    bookingRaw.status,
  );

  return (
    <div className="min-h-screen bg-bg-screen pb-24">
      <TopBar title="Job details" back="/m/jobs" />
      {isActive && (
        <div className="px-5 pt-3 flex flex-wrap gap-2">
          <Link
            href={`/m/booking/${bookingRaw.id}/report-issue`}
            className="inline-flex items-center gap-1 rounded-pill bg-rose-50 border border-rose-200 px-3 py-1.5 text-[12px] font-semibold text-rose-800"
          >
            Report issue
          </Link>
          <Link
            href={`/m/booking/${bookingRaw.id}/leave`}
            className="inline-flex items-center gap-1 rounded-pill bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12px] font-semibold text-amber-900"
          >
            Request to leave
          </Link>
          <Link
            href="/m/support"
            className="inline-flex items-center gap-1 rounded-pill bg-white border border-line px-3 py-1.5 text-[12px] font-semibold text-heading"
          >
            Talk to safety
          </Link>
        </div>
      )}
      <TargetedJobClient
        booking={{
          id: bookingRaw.id,
          status: bookingRaw.status,
          starts_at: bookingRaw.starts_at,
          ends_at: bookingRaw.ends_at,
          hours: Number(bookingRaw.hours),
          hourly_rate_cents: bookingRaw.hourly_rate_cents,
          currency: bookingRaw.currency,
          service_type: bookingRaw.service_type,
          location_city: bookingRaw.location_city,
          location_country: bookingRaw.location_country,
          location_postcode_partial: partialPostcode(
            bookingRaw.location_postcode,
          ),
          notes: bookingRaw.notes,
          discovery_expires_at: bookingRaw.discovery_expires_at,
          accepted_at: bookingRaw.accepted_at,
        }}
        seekerId={bookingRaw.seeker_id}
        clientFirstName={firstName(prof?.full_name ?? null)}
        initialPreferred={!!pref}
        servicePoint={
          typeof lng === "number" && typeof lat === "number"
            ? { lng, lat }
            : null
        }
        mapboxToken={getPublicToken()}
        mapStyle={getStyle()}
      />
    </div>
  );
}
