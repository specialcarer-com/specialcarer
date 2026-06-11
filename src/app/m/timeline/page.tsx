import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar, BottomNav } from "../_components/ui";
import { getTimelineFeed } from "@/lib/timeline/server";
import TimelineClient from "./TimelineClient";

/**
 * Family Timeline (gap 41).
 *
 * A chronological feed of care events — notes, visits — around the family.
 * Visible to the seeker, active family members, and carers on bookings (their
 * own bookings' events only). Comments + reactions inline.
 *
 * Shared across roles, so BottomNav auto-detects the role for the right tab
 * set. The page is NOT in middleware's seeker/carer-only lists — both roles
 * reach it (carers see the recipients of bookings they're on).
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Family timeline — SpecialCarers" };

export default async function TimelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/timeline");

  const initial = await getTimelineFeed({ limit: 20 });
  const feed = "error" in initial ? { events: [], next_cursor: null } : initial;

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Family timeline" back="/m/family" />
      <TimelineClient
        initialEvents={feed.events}
        initialCursor={feed.next_cursor}
        currentUserId={user.id}
      />
      <BottomNav active="home" />
    </main>
  );
}
