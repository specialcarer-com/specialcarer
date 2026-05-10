"use client";

/**
 * Home (carer) — proper dashboard.
 *
 * Above-the-fold:
 *   • Greeting + bell on a teal "hero" header
 *   • Stats strip — today, this week, streak
 *
 * Body:
 *   • Next shift card (if any active or upcoming booking)
 *   • Quick actions grid — Schedule, Availability, Time off, Earnings
 *   • New jobs preview — top 3 from /api/m/jobs with "See all" → /m/jobs
 *   • Tip of the day
 *
 * All data is best-effort. Each section degrades gracefully on error.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  BottomNav,
  Card,
  IconAward,
  IconBag,
  IconCal,
  IconCert,
  IconChevronRight,
  IconClock,
  IconPin,
  IconPlus,
  NotificationBell,
  SectionTitle,
  Tag,
} from "../_components/ui";
import { createClient } from "@/lib/supabase/client";
import { serviceLabel } from "@/lib/care/services";

type EarningsSummary = {
  today_cents: number;
  week_cents: number;
  month_cents: number;
  completed_bookings_this_week: number;
  available_balance_cents: number;
  currency: string;
};

type JobItem = {
  id: string;
  kind: "targeted_booking" | "open_request";
  client_first_name: string;
  service_type: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  starts_at: string;
  ends_at: string;
  location_city: string | null;
  distance_km: number | null;
  surge: boolean;
};

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(0)}`;
}

function fmtMoney2(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtTimeRange(startsAt: string, endsAt: string): string {
  try {
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    const same = s.toDateString() === e.toDateString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayKey = new Date(s);
    dayKey.setHours(0, 0, 0, 0);
    let day: string;
    if (dayKey.getTime() === today.getTime()) day = "Today";
    else if (dayKey.getTime() === tomorrow.getTime()) day = "Tomorrow";
    else
      day = s.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    const t = (d: Date) =>
      d
        .toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
        .toLowerCase()
        .replace(" ", "");
    return same ? `${day} · ${t(s)}–${t(e)}` : `${day} · ${t(s)}`;
  } catch {
    return "";
  }
}

export default function CarerHomeClient() {
  const [name, setName] = useState("there");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [activeJob, setActiveJob] = useState<JobItem | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  // Profile / identity
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const user = data.user;
        const meta = user?.user_metadata as
          | { full_name?: string; first_name?: string; avatar_url?: string }
          | undefined;
        const display =
          meta?.first_name ||
          meta?.full_name?.split(" ")[0] ||
          user?.email?.split("@")[0] ||
          "there";
        setName(display);
        if (meta?.avatar_url) setAvatarUrl(meta.avatar_url);
        if (user?.id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("avatar_url")
            .eq("id", user.id)
            .maybeSingle();
          if (!cancelled && prof?.avatar_url) setAvatarUrl(prof.avatar_url);
        }
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Earnings
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/earnings/summary", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = (await res.json()) as {
          summary: EarningsSummary;
          streak_weeks?: number;
        };
        if (cancelled) return;
        setEarnings(j.summary);
        setStreak(j.streak_weeks ?? 0);
      } catch {
        /* keep null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Jobs preview (top 3 + active job extraction)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/jobs", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { items?: JobItem[] };
        if (cancelled) return;
        const items = j.items ?? [];
        setJobs(items.slice(0, 3));
        // The earliest accepted/in-progress targeted booking acts as the
        // "next shift" card. Falls back to the soonest item if none.
        const next =
          items
            .filter((it) => it.kind === "targeted_booking")
            .sort(
              (a, b) =>
                new Date(a.starts_at).getTime() -
                new Date(b.starts_at).getTime(),
            )[0] ??
          items.sort(
            (a, b) =>
              new Date(a.starts_at).getTime() -
              new Date(b.starts_at).getTime(),
          )[0] ??
          null;
        setActiveJob(next);
      } catch {
        /* keep empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Verification badge state — best effort
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) return;
        const { data: cv } = await supabase
          .from("caregiver_verifications")
          .select("background_check_status")
          .eq("user_id", u.user.id)
          .maybeSingle();
        if (cancelled) return;
        setVerified(cv?.background_check_status === "passed");
      } catch {
        /* keep null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tip = useMemo(() => pickTip(), []);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      {/* Teal hero header — distinct from seeker home (white) */}
      <header
        className="sc-safe-top relative px-4 pb-6 pt-2"
        style={{
          background:
            "linear-gradient(160deg, #0E7C7B 0%, #039EA0 55%, #02787A 100%)",
        }}
      >
        <div className="flex items-center justify-between">
          <Link
            href="/m/profile"
            className="flex items-center gap-3 sc-no-select"
          >
            <Avatar size={42} name={name} src={avatarUrl || undefined} />
            <div className="leading-tight">
              <p className="text-[12px] text-white/80">Welcome back,</p>
              <p className="text-[15px] font-bold text-white capitalize flex items-center gap-1.5">
                {name}
                {verified && (
                  <span
                    aria-label="Background-checked"
                    title="Background-checked"
                    className="grid h-4 w-4 place-items-center rounded-full bg-white/25 text-white"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}
              </p>
            </div>
          </Link>
          <NotificationBell />
        </div>

        {/* Stats strip */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <StatTile
            label="Today"
            value={
              earnings ? fmtMoney(earnings.today_cents, earnings.currency) : "—"
            }
            sub="earned"
          />
          <StatTile
            label="This week"
            value={
              earnings ? fmtMoney(earnings.week_cents, earnings.currency) : "—"
            }
            sub={
              earnings
                ? `${earnings.completed_bookings_this_week} shift${earnings.completed_bookings_this_week === 1 ? "" : "s"}`
                : ""
            }
          />
          <StatTile
            label="Streak"
            value={streak > 0 ? `${streak}w` : "—"}
            sub="active"
          />
        </div>

        {/* Available payout balance — only when meaningful */}
        {earnings && earnings.available_balance_cents > 0 && (
          <Link
            href="/m/earnings"
            className="mt-3 flex items-center justify-between rounded-card bg-white/15 px-4 py-3 sc-no-select"
          >
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/70">
                Available to cash out
              </p>
              <p className="text-[18px] font-bold text-white">
                {fmtMoney2(earnings.available_balance_cents, earnings.currency)}
              </p>
            </div>
            <span className="text-white/90 font-bold text-[13px]">
              Cash out
            </span>
          </Link>
        )}
      </header>

      {/* Next shift card */}
      {activeJob && (
        <>
          <SectionTitle
            title="Next shift"
            action={
              <Link
                href="/m/jobs"
                className="text-primary font-bold text-[13px]"
              >
                All jobs
              </Link>
            }
          />
          <div className="px-4">
            <Link href={`/m/jobs/${activeJob.id}`} className="block">
              <Card>
                <div className="flex items-start gap-3">
                  <div
                    className="grid h-12 w-12 flex-none place-items-center rounded-full"
                    style={{
                      background: "rgba(3,158,160,0.10)",
                      color: "#039EA0",
                    }}
                    aria-hidden
                  >
                    <IconCal />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-bold text-heading truncate">
                      {activeJob.client_first_name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Tag tone="primary">
                        {serviceLabel(activeJob.service_type)}
                      </Tag>
                      {activeJob.surge && <Tag tone="amber">Surge</Tag>}
                    </div>
                  </div>
                  <span className="text-subheading" aria-hidden>
                    <IconChevronRight />
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-[13px] text-heading">
                  <li className="flex items-center gap-2">
                    <span className="text-subheading">
                      <IconClock />
                    </span>
                    {fmtTimeRange(activeJob.starts_at, activeJob.ends_at)}
                  </li>
                  {activeJob.location_city && (
                    <li className="flex items-center gap-2">
                      <span className="text-subheading">
                        <IconPin />
                      </span>
                      {activeJob.location_city}
                      {activeJob.distance_km != null && (
                        <span className="text-subheading">
                          {" · "}
                          {activeJob.distance_km.toFixed(1)} km
                        </span>
                      )}
                    </li>
                  )}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  <p className="text-[12px] text-subheading">
                    {activeJob.hours.toFixed(1)} hr ·{" "}
                    {fmtMoney2(activeJob.hourly_rate_cents, activeJob.currency)}
                    /hr
                  </p>
                  <p className="text-[16px] font-bold text-heading">
                    {fmtMoney2(
                      Math.round(
                        activeJob.hourly_rate_cents * activeJob.hours,
                      ),
                      activeJob.currency,
                    )}
                  </p>
                </div>
              </Card>
            </Link>
          </div>
        </>
      )}

      {/* Find work — always visible, primary CTA */}
      <SectionTitle title="Find work" />
      <div className="px-4">
        <Link href="/m/jobs" className="block sc-no-select">
          <div
            className="rounded-card p-4 text-white relative overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, #0E7C7B 0%, #039EA0 70%, #02787A 100%)",
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="grid h-11 w-11 flex-none place-items-center rounded-full"
                style={{ background: "rgba(255,255,255,0.18)" }}
                aria-hidden
              >
                <IconBag />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold">Browse open jobs</p>
                <p className="mt-0.5 text-[12px] text-white/85">
                  {jobs.length > 0
                    ? `${jobs.length} new ${jobs.length === 1 ? "opportunity" : "opportunities"} near you`
                    : "Search shifts, set filters, and apply with one tap."}
                </p>
              </div>
              <span className="text-white/90" aria-hidden>
                <IconChevronRight />
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Quick actions */}
      <SectionTitle title="Quick actions" />
      <div className="px-4 grid grid-cols-2 gap-3">
        <QuickAction
          href="/m/schedule"
          icon={<IconCal />}
          label="Schedule"
          sub="Shifts & rota"
        />
        <QuickAction
          href="/m/earnings"
          icon={<IconBag />}
          label="Earnings"
          sub="Payouts & history"
        />
        <QuickAction
          href="/m/schedule#availability"
          icon={<IconClock />}
          label="Availability"
          sub="Set weekly hours"
        />
        <QuickAction
          href="/m/schedule#timeoff"
          icon={<IconPlus />}
          label="Request time off"
          sub="Block dates"
        />
      </div>

      {/* New jobs preview */}
      {jobs.length > 0 && (
        <>
          <SectionTitle
            title="New jobs near you"
            action={
              <Link
                href="/m/jobs"
                className="text-primary font-bold text-[13px]"
              >
                See all
              </Link>
            }
          />
          <div className="px-4 space-y-3">
            {jobs.map((j) => (
              <Link
                key={j.id}
                href={`/m/jobs/${j.id}`}
                className="block sc-no-select"
              >
                <Card>
                  <div className="flex items-start gap-3">
                    <div
                      className="grid h-11 w-11 flex-none place-items-center rounded-full"
                      style={{
                        background:
                          j.kind === "targeted_booking"
                            ? "rgba(244,162,97,0.15)"
                            : "rgba(3,158,160,0.10)",
                        color:
                          j.kind === "targeted_booking" ? "#B5651D" : "#039EA0",
                      }}
                      aria-hidden
                    >
                      <IconBag />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[15px] font-bold text-heading truncate">
                          {j.client_first_name}
                        </p>
                        {j.kind === "targeted_booking" ? (
                          <Tag tone="amber">Invited</Tag>
                        ) : (
                          <Tag tone="primary">Open</Tag>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-subheading">
                        {serviceLabel(j.service_type)} ·{" "}
                        {fmtTimeRange(j.starts_at, j.ends_at)}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <p className="text-[12px] text-subheading">
                          {j.location_city || "Nearby"}
                          {j.distance_km != null && (
                            <span> · {j.distance_km.toFixed(1)} km</span>
                          )}
                        </p>
                        <p className="text-[14px] font-bold text-heading">
                          {fmtMoney2(j.hourly_rate_cents, j.currency)}
                          <span className="text-[11px] text-subheading font-normal">
                            /hr
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Tip of the day */}
      <SectionTitle title="Tip of the day" />
      <div className="px-4 pb-6">
        <Card>
          <div className="flex items-start gap-3">
            <span
              className="grid h-11 w-11 flex-none place-items-center rounded-full"
              style={{
                background: "rgba(3,158,160,0.10)",
                color: "#039EA0",
              }}
              aria-hidden
            >
              {tip.icon === "award" ? <IconAward /> : <IconCert />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-heading">{tip.title}</p>
              <p className="mt-0.5 text-[12px] text-subheading">{tip.body}</p>
              {tip.cta && tip.href && (
                <Link
                  href={tip.href}
                  className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-primary"
                >
                  {tip.cta}
                  <IconChevronRight />
                </Link>
              )}
            </div>
          </div>
        </Card>
      </div>

      <BottomNav active="home" role="carer" />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────────────────────── */

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-card bg-white/15 backdrop-blur-sm px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-white/70">
        {label}
      </p>
      <p className="mt-0.5 text-[20px] font-bold text-white leading-none">
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-white/70">{sub}</p>}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <Link href={href} className="block sc-no-select">
      <div className="rounded-card bg-white border border-line p-4 h-full active:bg-muted/60 transition-colors">
        <div
          className="grid h-10 w-10 place-items-center rounded-full"
          style={{ background: "rgba(3,158,160,0.10)", color: "#039EA0" }}
          aria-hidden
        >
          {icon}
        </div>
        <p className="mt-2.5 text-[14px] font-bold text-heading">{label}</p>
        <p className="text-[12px] text-subheading">{sub}</p>
      </div>
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Tip of the day — rotates by date so it feels fresh without
   needing a backend for now.
   ────────────────────────────────────────────────────────────────── */
type Tip = {
  icon: "award" | "cert";
  title: string;
  body: string;
  cta?: string;
  href?: string;
};

const TIPS: Tip[] = [
  {
    icon: "award",
    title: "Carers with a photo get 2× more bookings",
    body: "A clear, friendly headshot helps families pick you faster.",
    cta: "Update profile",
    href: "/m/profile",
  },
  {
    icon: "cert",
    title: "Add an extra certification",
    body: "First-aid, dementia, or moving-and-handling certs unlock higher-paying shifts.",
    cta: "Add certification",
    href: "/m/profile",
  },
  {
    icon: "award",
    title: "Open your weekend availability",
    body: "Saturday and Sunday shifts pay up to 30% more on SpecialCarer.",
    cta: "Set availability",
    href: "/m/schedule",
  },
  {
    icon: "cert",
    title: "Reply within 30 minutes",
    body: "Carers who reply quickly get priority on new invites.",
  },
  {
    icon: "award",
    title: "Refer a fellow carer",
    body: "Earn a bonus when someone you refer completes their first shift.",
    cta: "View referrals",
    href: "/m/profile",
  },
];

function pickTip(): Tip {
  // Day-of-year rotation
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const day = Math.floor(diff / 86_400_000);
  return TIPS[day % TIPS.length];
}
