"use client";

import {
  TopBar,
  BottomNav,
  ComingSoon,
  IconJournal,
  IconCamera,
  IconChat,
  IconClock,
} from "../_components/ui";

/**
 * Care journal placeholder.
 *
 * Real implementation (next-but-one session):
 *   - Supabase table care_journal_entries(booking_id, carer_id, body,
 *     mood, photos[], created_at) with RLS: carer-write/family-read.
 *   - Storage bucket "journal-photos" with signed-URL access.
 *   - Carer-side `/m/journal/new` composer with photo upload + mood
 *     chips (calm / engaged / unsettled / sleepy).
 *   - Family-side timeline view (this URL becomes the timeline).
 *   - Push notification when a new entry lands.
 */
export default function JournalPage() {
  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Care journal" />

      <ComingSoon
        hero={<IconJournal />}
        title="Daily updates from the people you love"
        description="Carers will be able to share short notes, photos and mood updates after each visit — so the whole family can see how your loved one's day went, even when you can't be there."
        bullets={[
          {
            icon: <IconChat />,
            text: "Daily notes from your carer summarising what went well and anything to flag.",
          },
          {
            icon: <IconCamera />,
            text: "Photo moments — a smile at lunch, a walk in the park — shared straight to the family.",
          },
          {
            icon: <IconClock />,
            text: "Searchable timeline so you can look back across weeks or share with a GP.",
          },
        ]}
        secondary={{ label: "Back to home", href: "/m/home" }}
      />

      <BottomNav active="home" />
    </main>
  );
}
