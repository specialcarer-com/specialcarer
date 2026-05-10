"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CaregiverStatsDisplay } from "@/lib/care/caregiver-stats";
import {
  Avatar,
  Button,
  Card,
  CarerBadges,
  IconAward,
  IconCert,
  IconCheck,
  IconClock,
  IconInfo,
  IconLanguage,
  IconPin,
  IconStar,
  NotificationBell,
  Stars,
  Tabs,
  TopBar,
} from "../../_components/ui";
import SaveBlockMenu from "../../_components/SaveBlockMenu";
import {
  CARE_FORMAT_LABEL,
  SERVICE_LABEL,
} from "../../_lib/mock";
import { formatMoney } from "@/lib/care/services";
import type { ApiCarerResponse } from "@/app/api/m/carer/[id]/route";

/**
 * Carer profile — Figma 31:445 (About), 35:1155 (Availability),
 * 35:1280 (Reviews). Single screen with three tabs and a sticky
 * "Book" CTA at the bottom.
 *
 * Data comes from /api/m/carer/[id] — real Supabase rows, not mock.
 */

export default function CarerDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  // Forward any browse-context params (postcode, service, date, start, end)
  // into the booking flow so the seeker doesn't re-enter them.
  const bookHref = (() => {
    const qs = searchParams?.toString() ?? "";
    return qs
      ? `/m/book/${params.id}?${qs}`
      : `/m/book/${params.id}`;
  })();
  const [tab, setTab] = useState<"about" | "availability" | "reviews">("about");

  const carerId = params?.id ?? "";
  const isUuidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    carerId,
  );

  // ── Real API data ──────────────────────────────────────────────
  const [data, setData] = useState<ApiCarerResponse | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "404">(
    "loading",
  );

  useEffect(() => {
    if (!isUuidId) {
      setLoadState("404");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/m/carer/${carerId}`);
        if (!res.ok) {
          if (!cancelled) setLoadState("404");
          return;
        }
        const json = (await res.json()) as ApiCarerResponse;
        if (!cancelled) {
          setData(json);
          setLoadState("ok");
        }
      } catch {
        if (!cancelled) setLoadState("404");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carerId, isUuidId]);

  // ── Track-record stats ─────────────────────────────────────────
  const [stats, setStats] = useState<CaregiverStatsDisplay | null>(null);
  useEffect(() => {
    if (!isUuidId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/carer-stats/${carerId}`);
        if (!res.ok) return;
        const json = (await res.json()) as { stats?: CaregiverStatsDisplay };
        if (!cancelled && json.stats) setStats(json.stats);
      } catch {
        /* ignore — stats are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carerId, isUuidId]);

  type EarnedAchievement = {
    achievement_key: string;
    label: string;
    description: string;
  };
  const [achievements, setAchievements] = useState<EarnedAchievement[]>([]);
  useEffect(() => {
    if (!isUuidId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/carer-achievements/${carerId}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          achievements?: EarnedAchievement[];
        };
        if (!cancelled && Array.isArray(json.achievements)) {
          setAchievements(json.achievements);
        }
      } catch {
        /* ignore — achievements are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carerId, isUuidId]);

  // ── Loading state ──────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back="/m/search" title="Professional" />
        <div className="px-6 mt-4 flex flex-col items-center gap-3 animate-pulse">
          <div className="w-28 h-28 rounded-full bg-muted" />
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-4 w-28 bg-muted rounded" />
        </div>
        <div className="px-4 mt-8 space-y-4 animate-pulse">
          <div className="rounded-card border border-line overflow-hidden">
            <div className="h-10 bg-muted" />
            <div className="p-4 space-y-2">
              <div className="h-3 w-full bg-muted rounded" />
              <div className="h-3 w-5/6 bg-muted rounded" />
              <div className="h-3 w-4/6 bg-muted rounded" />
            </div>
          </div>
          <div className="rounded-card border border-line overflow-hidden">
            <div className="h-10 bg-muted" />
            <div className="p-4 space-y-2">
              <div className="h-3 w-full bg-muted rounded" />
              <div className="h-3 w-3/4 bg-muted rounded" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── 404 state ──────────────────────────────────────────────────
  if (loadState === "404" || !data) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back="/m/search" title="Professional" />
        <div className="px-6 mt-10 text-center">
          <p className="text-heading font-semibold">Carer not found</p>
          <Link href="/m/search" className="mt-3 inline-block text-primary font-bold">
            Browse carers
          </Link>
        </div>
      </main>
    );
  }

  // ── OK state ───────────────────────────────────────────────────
  const { profile, photos, reviews, preview, is_published } = data;

  const displayName = profile.display_name || profile.full_name || "Carer";
  const photoSrc = profile.photo_url || profile.avatar_url || undefined;
  const currency = (profile.currency?.toUpperCase() as "GBP" | "USD") ?? "GBP";

  const locationStr = [profile.city, profile.country].filter(Boolean).join(", ");

  return (
    <main className="min-h-[100dvh] bg-white pb-32">
      <TopBar
        back="/m/search"
        title="Professionals"
        right={
          <div className="flex items-center gap-2">
            {isUuidId && <SaveBlockMenu caregiverId={carerId} />}
            <NotificationBell />
          </div>
        }
      />

      {/* Preview banner */}
      {preview && (
        <div
          className="sticky top-0 z-20 border-b border-[#F4D9A8] bg-[#FFF4E5] px-4 py-2 text-[12px] text-[#7A4A0F]"
        >
          Preview mode — this is how seekers will see your profile
          {!is_published ? " once it's published" : ""}.{" "}
          <Link href="/m/profile/edit" className="font-semibold underline">
            Edit profile →
          </Link>
        </div>
      )}

      {/* Header card */}
      <div className="px-6 mt-2 flex flex-col items-center text-center">
        <Avatar src={photoSrc} name={displayName} size={112} />
        <h1 className="mt-3 text-[22px] font-bold text-heading">
          {displayName}
        </h1>
        {profile.headline && (
          <p className="mt-0.5 text-[14px] text-subheading">{profile.headline}</p>
        )}
        {locationStr && (
          <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-subheading">
            <IconPin /> {locationStr}
          </p>
        )}
        {/* Badges — isClinical/isNurse derived from certifications/tags */}
        {(profile.tags?.includes("clinical") || profile.tags?.includes("nurse")) && (
          <div className="mt-2">
            <CarerBadges
              isClinical={profile.tags?.includes("clinical")}
              isNurse={profile.tags?.includes("nurse")}
            />
          </div>
        )}
        <p className="mt-1 inline-flex items-center gap-3 text-[13px] text-subheading">
          {profile.years_experience != null && (
            <>
              <span className="inline-flex items-center gap-1">
                <IconAward /> {profile.years_experience}+ years
              </span>
              {profile.rating_count > 0 && <span>•</span>}
            </>
          )}
          {profile.rating_count > 0 && profile.rating_avg != null && (
            <span className="inline-flex items-center gap-1 text-heading font-semibold">
              <IconStar /> {profile.rating_avg.toFixed(1)}{" "}
              <span className="font-normal text-subheading">
                ({profile.rating_count})
              </span>
            </span>
          )}
        </p>
        {isUuidId && achievements.length > 0 && (
          <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
            {achievements.map((a) => (
              <li
                key={a.achievement_key}
                title={a.description}
                className="inline-flex items-center gap-1 rounded-pill bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary"
              >
                {achievementIcon(a.achievement_key)}
                <span>{a.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-5">
        <Tabs
          tabs={[
            { key: "about", label: "About" },
            { key: "availability", label: "Availability" },
            { key: "reviews", label: "Reviews" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
        />
      </div>

      {/* Tab content */}
      <div className="px-4 mt-4 space-y-4">
        {tab === "about" && (
          <>
            <PanelCard icon={<IconInfo />} title="Details">
              <p className="text-[13px] text-subheading leading-relaxed">
                {profile.bio || "This caregiver hasn't added a bio yet."}
              </p>
            </PanelCard>

            {stats && (
              <PanelCard icon={<IconAward />} title="Track record">
                {stats.has_stats ? (
                  <ul className="grid grid-cols-3 gap-2">
                    <TrackTile
                      value={
                        stats.repeat_client_rate_pct != null
                          ? `${stats.repeat_client_rate_pct}%`
                          : "—"
                      }
                      label="Repeat clients"
                      tooltip="Share of recent clients who've booked this carer more than once."
                    />
                    <TrackTile
                      value={
                        stats.response_time_minutes != null
                          ? `~${stats.response_time_minutes}m`
                          : "—"
                      }
                      label="Reply time"
                      tooltip="Median time to respond to booking requests in the last 30 days."
                    />
                    <TrackTile
                      value={
                        stats.on_time_rate_pct != null
                          ? `${stats.on_time_rate_pct}%`
                          : "—"
                      }
                      label="On time"
                      tooltip="Share of tracked shifts where the carer arrived within 10 minutes of the start time."
                    />
                  </ul>
                ) : (
                  <p className="text-[12px] text-subheading">
                    New carer — full track record after 5 completed bookings.
                  </p>
                )}
              </PanelCard>
            )}

            <PanelCard icon={<IconClock />} title="Rates">
              <ul className="grid grid-cols-2 gap-2">
                {profile.care_formats.includes("visiting") &&
                  profile.hourly_rate_cents != null && (
                    <li className="rounded-btn border border-line p-3">
                      <p className="text-[18px] font-bold text-heading leading-none">
                        {formatMoney(profile.hourly_rate_cents, currency)}
                        <span className="text-[12px] text-subheading font-normal">
                          {" "}/ hr
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-subheading">
                        {CARE_FORMAT_LABEL.visiting}
                      </p>
                    </li>
                  )}
                {profile.care_formats.includes("live_in") &&
                  profile.weekly_rate_cents != null && (
                    <li className="rounded-btn border border-line p-3">
                      <p className="text-[18px] font-bold text-heading leading-none">
                        {formatMoney(profile.weekly_rate_cents, currency)}
                        <span className="text-[12px] text-subheading font-normal">
                          {" "}/ wk
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-subheading">
                        {CARE_FORMAT_LABEL.live_in}
                      </p>
                    </li>
                  )}
                {profile.hourly_rate_cents == null &&
                  profile.weekly_rate_cents == null && (
                    <li className="col-span-2 text-[13px] text-subheading">
                      Rate on request
                    </li>
                  )}
              </ul>
              {!profile.care_formats.includes("live_in") &&
                profile.care_formats.includes("visiting") && (
                  <p className="mt-2 text-[11px] text-subheading">
                    This carer offers visiting care only.
                  </p>
                )}
            </PanelCard>

            {profile.services.length > 0 && (
              <PanelCard
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 21s-7-4.35-7-10a5 5 0 019-3 5 5 0 019 3c0 5.65-7 10-7 10z" />
                  </svg>
                }
                title="Services"
              >
                <ul className="flex flex-wrap gap-2">
                  {profile.services.map((s) => {
                    const label =
                      SERVICE_LABEL[s as keyof typeof SERVICE_LABEL] ?? s;
                    return (
                      <li
                        key={s}
                        className="rounded-btn border border-line px-3 py-1.5 text-[13px] text-heading"
                      >
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </PanelCard>
            )}

            {profile.languages.length > 0 && (
              <PanelCard icon={<IconLanguage />} title="Languages Known">
                <ul className="space-y-1 text-[14px] text-heading">
                  {profile.languages.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </PanelCard>
            )}

            {profile.certifications.length > 0 && (
              <PanelCard icon={<IconCert />} title="Certifications">
                <ul className="divide-y divide-line -mx-1">
                  {profile.certifications.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 px-1 py-3 first:pt-1 last:pb-1"
                    >
                      <span
                        className="shrink-0 w-10 h-10 rounded-full grid place-items-center text-primary"
                        style={{ background: "rgba(3,158,160,0.1)" }}
                        aria-hidden
                      >
                        <CertIcon title={c} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-heading leading-tight">
                          {c}
                        </p>
                      </div>
                      <span
                        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#E8F6EC] px-2 py-1 text-[11px] font-semibold text-[#1F7A3F]"
                        aria-label="Verified"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Verified
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 -mx-1 -mb-1 rounded-card bg-bg-screen px-3 py-2.5 flex items-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#039EA0"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                  <p className="text-[12px] text-subheading">
                    Background-checked by SpecialCarer
                  </p>
                </div>
              </PanelCard>
            )}

            {/* Photo gallery — only shown when photos exist */}
            {photos.length > 0 && (
              <PanelCard
                icon={
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                }
                title="Photos"
              >
                <ul className="grid grid-cols-3 gap-2">
                  {photos.map((p) => (
                    <li key={p.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt=""
                        className="rounded-btn aspect-square object-cover w-full"
                      />
                    </li>
                  ))}
                </ul>
              </PanelCard>
            )}
          </>
        )}

        {tab === "availability" && (
          <>
            <Card className="text-center py-8">
              <p className="text-heading font-semibold">Availability</p>
              <p className="mt-2 text-[13px] text-subheading">
                Availability is shared once a booking is requested.
              </p>
            </Card>
          </>
        )}

        {tab === "reviews" && (
          <>
            {reviews.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-heading font-semibold">No reviews yet</p>
                <p className="mt-2 text-[13px] text-subheading">
                  Be the first to leave a review after your first booking.
                </p>
              </Card>
            ) : (
              reviews.map((r) => (
                <Card key={r.id}>
                  <div className="flex items-start gap-3">
                    <Avatar src={undefined} name={r.reviewer_name} size={42} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-heading">
                        {r.reviewer_name}
                      </p>
                      <p className="text-[12px] text-subheading">
                        {new Date(r.created_at).toLocaleDateString("en-GB", {
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-[13px] font-bold text-heading">
                        {r.rating.toFixed(1)} <IconStar />
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] text-heading leading-relaxed">
                    {r.body}
                  </p>
                  <div className="mt-2">
                    <Stars value={r.rating} />
                  </div>
                </Card>
              ))
            )}
          </>
        )}
      </div>

      {/* Sticky Book CTA — hidden when previewing own profile */}
      {!preview && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line px-4 pt-3 sc-safe-bottom">
          <Link href={bookHref}>
            <Button block>Request booking</Button>
          </Link>
        </div>
      )}
    </main>
  );
}

function PanelCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted border-b border-line">
        <span className="text-heading">{icon}</span>
        <h3 className="text-[14px] font-bold text-heading">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function TrackTile({
  value,
  label,
  tooltip,
}: {
  value: string;
  label: string;
  tooltip: string;
}) {
  return (
    <li
      className="rounded-btn border border-line p-3 text-center"
      title={tooltip}
    >
      <p className="text-[18px] font-bold text-heading leading-none">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-subheading">{label}</p>
    </li>
  );
}

/**
 * Picks a glyph that matches the certification type. Falls back to a
 * generic shield. We match on lowercase substrings so e.g.
 * "First Aid (Pediatric)" → cross, "Dementia Care Level 3" → brain.
 */
function CertIcon({ title }: { title: string }) {
  const t = title.toLowerCase();
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (t.includes("first aid") || t.includes("cpr") || t.includes("pediatric")) {
    return (
      <svg {...props} aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (t.includes("dementia") || t.includes("mental") || t.includes("autism")) {
    return (
      <svg {...props} aria-hidden>
        <path d="M9 4a4 4 0 00-4 4 4 4 0 00-1 6 4 4 0 002 5 4 4 0 008 0V4a3 3 0 00-3 0z" />
        <path d="M15 4a3 3 0 013 0v15a4 4 0 11-8 0" />
      </svg>
    );
  }
  if (t.includes("heart") || t.includes("cardio") || t.includes("life support")) {
    return (
      <svg {...props} aria-hidden>
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    );
  }
  if (
    t.includes("child") ||
    t.includes("baby") ||
    t.includes("newborn") ||
    t.includes("postnatal")
  ) {
    return (
      <svg {...props} aria-hidden>
        <circle cx="12" cy="7" r="3" />
        <path d="M5 21v-2a4 4 0 014-4h6a4 4 0 014 4v2" />
      </svg>
    );
  }
  if (
    t.includes("food") ||
    t.includes("hygiene") ||
    t.includes("safeguard") ||
    t.includes("manual")
  ) {
    return (
      <svg {...props} aria-hidden>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    );
  }
  // Default: shield (DBS, CRB, RQF, NVQ, etc.)
  return (
    <svg {...props} aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function achievementIcon(key: string) {
  switch (key) {
    case "hundred_jobs":
    case "rookie_pro":
      return <IconAward />;
    case "top_rated":
    case "repeat_favourite":
      return <IconStar />;
    case "reliable":
    case "verified_carer":
      return <IconCheck />;
    case "quick_responder":
      return <IconClock />;
    case "dementia_specialist":
      return <IconCert />;
    default:
      return <IconAward />;
  }
}
