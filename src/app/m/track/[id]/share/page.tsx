/**
 * Live tracking — carer share page.
 *
 * Server-checks eligibility (caller must be the caregiver, booking must be
 * paid/in_progress), then renders the broadcast UI which:
 *   1. Asks for browser geolocation permission
 *   2. Pings POST /api/tracking/:id/ping every PING_INTERVAL_MS
 *   3. Shows a clear ON/OFF state and "last sent" timestamp
 *   4. Stops automatically when the page unmounts (no background broadcast)
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTrackingEligibility } from "@/lib/tracking/server";
import { TopBar, ComingSoon, IconMapPin, IconClock } from "../../../_components/ui";
import ShareClient from "./ShareClient";

export const dynamic = "force-dynamic";

export default async function ShareTrackPage({
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
    redirect(`/m/login?redirect=/m/track/${id}/share`);
  }

  const eligibility = await getTrackingEligibility(id);

  if (!eligibility.eligible || eligibility.role !== "caregiver") {
    return (
      <main className="min-h-[100dvh] bg-bg-screen">
        <TopBar title="Share location" back={`/m/track/${id}`} />
        <ComingSoon
          hero={<IconMapPin />}
          title="You can't share location for this booking"
          description={
            !eligibility.eligible
              ? eligibility.reason
              : "Only the assigned carer can broadcast location."
          }
          bullets={[
            {
              icon: <IconClock />,
              text: "Sharing only runs while the booking is paid or in progress.",
            },
          ]}
          primary={{ label: "Back to booking", href: `/m/bookings/${id}` }}
        />
      </main>
    );
  }

  // Has the carer already taken an arrival selfie for this booking?
  // Used by ShareClient to suppress the prompt once it's been done.
  const { data: bookingMeta } = await supabase
    .from("bookings")
    .select("arrival_selfie_path")
    .eq("id", id)
    .maybeSingle<{ arrival_selfie_path: string | null }>();

  return (
    <main className="min-h-[100dvh] bg-bg-screen">
      <TopBar title="Share location" back={`/m/track/${id}`} />
      <ShareClient
        bookingId={id}
        bookingStatus={eligibility.bookingStatus}
        hasArrivalSelfie={!!bookingMeta?.arrival_selfie_path}
      />
    </main>
  );
}
