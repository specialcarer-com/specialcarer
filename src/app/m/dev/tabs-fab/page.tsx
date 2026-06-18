"use client";

import type { ReactNode } from "react";
import {
  Card,
  IconCal,
  IconChat,
  IconChevronRight,
  IconHome,
  IconBag,
  IconStarOutline,
  IconUser,
  Stars,
  TopBar,
} from "../../_components/ui";
import PostJobFab from "@/components/m/PostJobFab";

/**
 * Dev-only visual gallery for the PR-R4 redesign surfaces.
 *
 * Not linked from the app and not flag-gated — it renders the variants
 * directly so reviewers can eyeball them on web without toggling env vars or
 * a signed-in session. Safe because it shows static markup only.
 */

type TabSpec = { key: string; label: string; icon: ReactNode };

const OLD_SEEKER_TABS: TabSpec[] = [
  { key: "home", label: "Home", icon: <IconHome /> },
  { key: "bookings", label: "Bookings", icon: <IconCal /> },
  { key: "jobs", label: "Post Job", icon: <IconBag /> },
  { key: "chat", label: "Chat", icon: <IconChat /> },
  { key: "profile", label: "Profile", icon: <IconUser /> },
];

const NEW_SEEKER_TABS: TabSpec[] = [
  { key: "home", label: "Home", icon: <IconHome /> },
  { key: "bookings", label: "Bookings", icon: <IconCal /> },
  { key: "chat", label: "Chat", icon: <IconChat /> },
  { key: "review", label: "Review", icon: <IconStarOutline /> },
  { key: "profile", label: "Profile", icon: <IconUser /> },
];

/** Static, non-fixed render of the bottom-nav bar for the gallery. */
function TabBarPreview({
  tabs,
  active,
}: {
  tabs: TabSpec[];
  active: string;
}) {
  return (
    <div className="rounded-card border border-line bg-white shadow-nav overflow-hidden">
      <ul className="grid grid-cols-5">
        {tabs.map((it) => {
          const isActive = it.key === active;
          return (
            <li key={it.key} className="relative">
              <div className="flex flex-col items-center justify-center pt-3 pb-2 gap-1">
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-full bg-primary" />
                )}
                <span className={isActive ? "text-primary" : "text-subheading"}>
                  {it.icon}
                </span>
                <span
                  className={`text-[11px] ${
                    isActive ? "text-primary font-bold" : "text-subheading"
                  }`}
                >
                  {it.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-bold text-heading">{title}</h2>
        {subtitle && (
          <p className="text-[13px] text-subheading">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export default function DevCardsGalleryPage() {
  return (
    <main className="min-h-[100dvh] bg-bg-screen">
      <TopBar title="Dev — Redesign gallery" />

      <div className="px-4 mt-4 space-y-8 pb-16">
        <Section
          title="Seeker bottom tabs"
          subtitle="Current vs redesign (Post Job → FAB, Review tab added)"
        >
          <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
            Current
          </p>
          <TabBarPreview tabs={OLD_SEEKER_TABS} active="bookings" />
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-subheading">
            Redesign
          </p>
          <TabBarPreview tabs={NEW_SEEKER_TABS} active="review" />
        </Section>

        <Section
          title="Post Job FAB"
          subtitle="Peach (#F4A261), 56×56, bottom-right above the nav"
        >
          <div className="relative h-32 rounded-card border border-line bg-bg-screen overflow-hidden">
            {/* Local FAB instance, pinned within this preview box rather than
                the viewport, so the gallery shows it in isolation. */}
            <div className="absolute right-4 bottom-4">
              <span
                role="button"
                aria-label="Post a new job"
                className="grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-card-md"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Review hub — empty state"
          subtitle="Shown when the seeker has no pending reviews"
        >
          <Card className="text-center py-10">
            <div aria-hidden="true" className="text-[40px] leading-none">
              ⭐
            </div>
            <p className="mt-3 text-heading font-semibold">
              Nothing to review right now.
            </p>
            <p className="mt-2 text-[13px] text-subheading">
              Your past reviews are listed below.
            </p>
          </Card>
          <Card>
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-full bg-muted" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-bold text-heading">
                    Amara Okafor
                  </p>
                  <span className="text-[12px] text-primary font-semibold">
                    Edit
                  </span>
                </div>
                <div className="mt-1">
                  <Stars value={5} />
                </div>
                <p className="mt-2 text-[13px] text-heading">
                  Punctual, kind and brilliant with mum. Would book again.
                </p>
              </div>
              <span className="text-subheading">
                <IconChevronRight />
              </span>
            </div>
          </Card>
        </Section>
      </div>

      {/* Also render the real FAB component once so the gallery exercises the
          shipped code path (it pins to the viewport, as in production). */}
      <PostJobFab href="/m/post-job" />
    </main>
  );
}
