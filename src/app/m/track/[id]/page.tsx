"use client";

import { use } from "react";
import {
  TopBar,
  ComingSoon,
  IconMapPin,
  IconClock,
  IconBell,
  IconCheck,
} from "../../_components/ui";

/**
 * Live tracking placeholder.
 *
 * Real implementation lands in the next session:
 *   - Mapbox GL JS (web) + Maps SDK for iOS via Capacitor plugin
 *   - Supabase realtime channel `carer_positions:<bookingId>`
 *   - Carer side broadcasts at ~1 Hz while booking.status === 'OnTheWay'
 *   - Seeker side subscribes + animates a marker along the polyline
 *   - ETA derived from Mapbox Directions API on each significant move
 *
 * Same URL stays put when real shipping happens — no router or
 * deeplink changes needed in messages, push notifications, or
 * booking detail's existing sticky CTA wire.
 */
export default function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <main className="min-h-[100dvh] bg-bg-screen">
      <TopBar title="Live tracking" back={`/m/bookings/${id}`} />

      <ComingSoon
        hero={<IconMapPin />}
        title="See your carer on the map"
        description="Once your booking is confirmed and the carer is on the way, you'll see their live location, route and minute-by-minute ETA right here — so you always know when to expect them at the door."
        bullets={[
          {
            icon: <IconMapPin />,
            text: "Live map with the carer's current location and route to your address.",
          },
          {
            icon: <IconClock />,
            text: "Continuously updated ETA — no more guessing or texting for updates.",
          },
          {
            icon: <IconBell />,
            text: "Optional arrival notification when they're 5 minutes away.",
          },
        ]}
        primary={{ label: "Back to booking", href: `/m/bookings/${id}` }}
        secondary={{ label: "Message the carer", href: `/m/chat` }}
      />

      <p className="text-center text-[11px] text-subheading pb-8">
        Booking #{id}
      </p>
    </main>
  );
}
