/**
 * Live tracking — seeker / family view.
 *
 * Server-renders the booking + initial eligibility, then hands off to the
 * client component which mounts a Mapbox GL map and polls the latest
 * position every few seconds. Falls back to a clear status message when
 * not eligible (booking finished, cancelled, etc.).
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getTrackingEligibility,
  getLatestPosition,
} from "@/lib/tracking/server";
import { getPublicToken, getStyle } from "@/lib/mapbox/server";
import {
  TopBar,
  ComingSoon,
  IconMapPin,
  IconClock,
  IconBell,
} from "../../_components/ui";
import TrackClient from "./TrackClient";

export const dynamic = "force-dynamic";

export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/m/login?redirect=/m/track/${id}`);
  }

  const eligibility = await getTrackingEligibility(id);

  if (!eligibility.eligible) {
    return (
      <main className="min-h-[100dvh] bg-bg-screen">
        <TopBar title="Live tracking" back={`/m/bookings/${id}`} />
        <ComingSoon
          hero={<IconMapPin />}
          title="Tracking not available right now"
          description={eligibility.reason}
          bullets={[
            {
              icon: <IconClock />,
              text: "Tracking turns on automatically once the booking is paid and the carer is on the way.",
            },
            {
              icon: <IconBell />,
              text: "We'll send a notification when sharing starts.",
            },
          ]}
          primary={{ label: "Back to booking", href: `/m/bookings/${id}` }}
          secondary={{ label: "Message the carer", href: `/m/chat` }}
        />
      </main>
    );
  }

  const initialPosition = await getLatestPosition(id);
  const mapboxToken = getPublicToken();
  const mapStyle = getStyle();

  // Fetch booking address for map centering fallback when no position yet.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, location_city, location_country, status")
    .eq("id", id)
    .maybeSingle();

  return (
    <main className="min-h-[100dvh] bg-bg-screen">
      <TopBar title="Live tracking" back={`/m/bookings/${id}`} />
      <TrackClient
        bookingId={id}
        role={eligibility.role}
        bookingStatus={eligibility.bookingStatus}
        initialPosition={initialPosition}
        mapboxToken={mapboxToken}
        mapStyle={mapStyle}
        locationCity={booking?.location_city ?? null}
        locationCountry={booking?.location_country ?? null}
      />
    </main>
  );
}
