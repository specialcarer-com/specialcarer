/**
 * /m/journal — care journal timeline.
 *
 * Server-rendered: pulls the user's recent journal entries (RLS limits
 * what they can see) and renders them grouped by day. Authenticated
 * users only — anonymous visitors get sent to the login screen.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { listJournalEntries } from "@/lib/journal/server";
import {
  JOURNAL_KIND_LABEL,
  JOURNAL_KIND_TONE,
  JOURNAL_MOOD_EMOJI,
  JOURNAL_MOOD_LABEL,
  type JournalEntry,
} from "@/lib/journal/types";
import {
  TopBar,
  BottomNav,
  Card,
  Button,
  Tag,
  ComingSoon,
  IconJournal,
  IconCamera,
  IconChat,
  IconClock,
} from "../_components/ui";

export const dynamic = "force-dynamic";

function formatDayLabel(d: Date): string {
  const today = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round(
    (startOfDay(today).getTime() - startOfDay(d).getTime()) /
      (24 * 60 * 60 * 1000),
  );
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDay(entries: JournalEntry[]) {
  const groups = new Map<string, { label: string; items: JournalEntry[] }>();
  for (const e of entries) {
    const d = new Date(e.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!groups.has(key)) {
      groups.set(key, { label: formatDayLabel(d), items: [] });
    }
    groups.get(key)!.items.push(e);
  }
  return Array.from(groups.values());
}

export default async function JournalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/m/login?redirect=/m/journal");
  }

  const entries = await listJournalEntries({ limit: 100 });

  // Empty state — keep the same friendly explainer the Coming Soon shell
  // had, but with a clear "Add your first note" primary CTA.
  if (entries.length === 0) {
    return (
      <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
        <TopBar
          title="Care journal"
          right={
            <Link
              href="/m/journal/new"
              className="text-primary font-bold text-[14px]"
            >
              New
            </Link>
          }
        />
        <ComingSoon
          hero={<IconJournal />}
          title="Daily updates from the people you love"
          description="Carers and family members can share short notes, photos, and mood updates after each visit — so the whole household can see how the day went."
          bullets={[
            {
              icon: <IconChat />,
              text: "Daily notes from your carer summarising what went well and anything to flag.",
            },
            {
              icon: <IconCamera />,
              text: "Photo moments — a smile at lunch, a walk in the park — shared with the family.",
            },
            {
              icon: <IconClock />,
              text: "Searchable timeline so you can look back across weeks or share with a GP.",
            },
          ]}
          primary={{
            label: "Add your first note",
            href: "/m/journal/new",
          }}
          secondary={{ label: "Back to home", href: "/m/home" }}
        />
        <BottomNav active="home" />
      </main>
    );
  }

  const groups = groupByDay(entries);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar
        title="Care journal"
        right={
          <Link
            href="/m/journal/new"
            className="text-primary font-bold text-[14px]"
            aria-label="Add a new journal note"
          >
            New
          </Link>
        }
      />

      <div className="px-4 pt-2 pb-6 space-y-6">
        {groups.map((g) => (
          <section key={g.label}>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-subheading mb-2 px-1">
              {g.label}
            </h2>
            <div className="space-y-3">
              {g.items.map((e) => (
                <EntryCard key={e.id} entry={e} authorIsMe={e.author_id === user.id} />
              ))}
            </div>
          </section>
        ))}

        <div className="pt-2">
          <Link href="/m/journal/new" className="block">
            <Button block>Add a note</Button>
          </Link>
        </div>
      </div>

      <BottomNav active="home" />
    </main>
  );
}

function EntryCard({
  entry,
  authorIsMe,
}: {
  entry: JournalEntry;
  authorIsMe: boolean;
}) {
  const t = formatTime(new Date(entry.created_at));
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Tag tone={JOURNAL_KIND_TONE[entry.kind]}>
            {JOURNAL_KIND_LABEL[entry.kind]}
          </Tag>
          {entry.mood && (
            <span className="text-[12px] text-subheading inline-flex items-center gap-1">
              <span aria-hidden>{JOURNAL_MOOD_EMOJI[entry.mood]}</span>
              {JOURNAL_MOOD_LABEL[entry.mood]}
            </span>
          )}
        </div>
        <span className="text-[12px] text-subheading shrink-0">{t}</span>
      </div>

      <p className="text-[14px] text-heading whitespace-pre-wrap leading-relaxed">
        {entry.body}
      </p>

      {entry.photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {entry.photos.map((p) =>
            p.url ? (
              <div
                key={p.path}
                className="relative aspect-square rounded-lg overflow-hidden bg-muted"
              >
                <Image
                  src={p.url}
                  alt="Journal photo"
                  fill
                  sizes="(max-width: 480px) 33vw, 160px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div
                key={p.path}
                className="aspect-square rounded-lg bg-muted border border-line text-[10px] text-subheading flex items-center justify-center"
              >
                Photo unavailable
              </div>
            ),
          )}
        </div>
      )}

      {authorIsMe && (
        <p className="mt-2 text-[11px] text-subheading">You wrote this</p>
      )}
    </Card>
  );
}
