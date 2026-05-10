"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Avatar,
  BottomNav,
  Button,
  Card,
  IconCert,
  IconCheck,
  IconChevronRight,
  IconPin,
  IconStar,
  SectionTitle,
  Stars,
  Tag,
  TopBar,
} from "../../_components/ui";
import { serviceLabel, formatMoney } from "@/lib/care/services";
import { careFormatLabel } from "@/lib/care/formats";
import type {
  ApiCarerResponse,
  ApiCarerProfile,
  ApiCarerPhoto,
  ApiCarerReview,
} from "@/app/api/m/carer/[id]/route";

/**
 * Mobile carer profile — backed by /api/m/carer/[id].
 *
 * Mirrors the rich web design at /caregiver/[id] but stays inside the
 * mobile shell (no MarketingShell). Sections render in this order:
 *
 *   1. TopBar (back to browse)
 *   2. Preview banner (own profile only)
 *   3. Hero — photo, name, headline, location, rating, rate
 *   4. Services pills
 *   5. Care formats pills
 *   6. About / bio
 *   7. Languages pills
 *   8. Experience / radius rows
 *   9. Photos (caregiver_photos)
 *  10. Reviews (real seekers)
 *  11. Vetted block (always)
 *  12. Sticky Book CTA (non-preview)
 *  13. BottomNav
 *
 * Loading state: skeleton blocks. 404: "Carer not found" + browse CTA.
 */

const COUNTRY_LABEL: Record<string, string> = {
  GB: "UK",
  US: "US",
};

function countryLabel(c: string | null | undefined): string | null {
  if (!c) return null;
  return COUNTRY_LABEL[c.toUpperCase()] ?? c.toUpperCase();
}

function narrowCurrency(c: string | null | undefined): "GBP" | "USD" {
  return (c ?? "GBP").toUpperCase() === "USD" ? "USD" : "GBP";
}

function formatRateLines(profile: ApiCarerProfile): string[] {
  const cur = narrowCurrency(profile.currency);
  const offersVisiting = profile.care_formats.includes("visiting");
  const offersLiveIn = profile.care_formats.includes("live_in");
  const lines: string[] = [];
  if (offersVisiting && profile.hourly_rate_cents != null) {
    lines.push(`${formatMoney(profile.hourly_rate_cents, cur)}/hr`);
  }
  if (offersLiveIn && profile.weekly_rate_cents != null) {
    lines.push(`${formatMoney(profile.weekly_rate_cents, cur)}/wk`);
  }
  if (lines.length === 0 && profile.hourly_rate_cents != null) {
    lines.push(`${formatMoney(profile.hourly_rate_cents, cur)}/hr`);
  }
  if (lines.length === 0) lines.push("Rate on request");
  return lines;
}

export default function MobileCarerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [data, setData] = useState<ApiCarerResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/m/carer/${id}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          setLoaded(true);
          return;
        }
        if (!res.ok) {
          setLoaded(true);
          return;
        }
        const json = (await res.json()) as ApiCarerResponse;
        if (!cancelled) {
          setData(json);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!loaded) {
    return (
      <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
        <TopBar title="Professional" back="/m/book/browse" />
        <div className="px-4 pt-4 space-y-4">
          <SkeletonHero />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
        <BottomNav active="home" />
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
        <TopBar title="Professional" back="/m/book/browse" />
        <div className="px-5 pt-10 text-center">
          <p className="text-[16px] font-bold text-heading">
            Carer not found
          </p>
          <p className="mt-1 text-[13px] text-subheading">
            The link may be out of date or the carer is no longer published.
          </p>
          <div className="mt-4">
            <Link href="/m/book/browse">
              <Button size="md">Browse carers</Button>
            </Link>
          </div>
        </div>
        <BottomNav active="home" />
      </main>
    );
  }

  const { preview, profile, photos, reviews } = data;
  const photoSrc = profile.photo_url ?? profile.avatar_url ?? undefined;
  const name =
    profile.display_name ?? profile.full_name ?? "Caregiver";
  const country = countryLabel(profile.country);
  const cityLine = [profile.city, country].filter(Boolean).join(", ");
  const rateLines = formatRateLines(profile);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Professional" back="/m/book/browse" />

      {preview && (
        <div className="px-4 pt-3">
          <div className="rounded-card border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900 flex items-start gap-3">
            <span aria-hidden className="text-[16px]">👀</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold">Preview mode</p>
              <p className="mt-0.5">
                This is how seekers will see your profile once it&rsquo;s
                published.
              </p>
            </div>
            <Link
              href="/m/profile/edit"
              className="shrink-0 text-[12px] font-bold text-amber-900 underline"
            >
              Edit profile →
            </Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="px-4 pt-4">
        <Card>
          <div className="flex items-start gap-3">
            <Avatar src={photoSrc} name={name} size={88} />
            <div className="flex-1 min-w-0">
              <p className="text-[20px] font-bold text-heading leading-tight truncate">
                {name}
              </p>
              {profile.headline && (
                <p className="mt-1 text-[13px] text-subheading">
                  {profile.headline}
                </p>
              )}
              {cityLine && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] text-subheading">
                  <IconPin /> {cityLine}
                </p>
              )}
              {profile.rating_count > 0 && profile.rating_avg != null && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold text-heading">
                  <IconStar />
                  {profile.rating_avg.toFixed(1)}
                  <span className="text-[12px] text-subheading font-medium">
                    ({profile.rating_count})
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-line mt-4 pt-3">
            <p className="text-[12px] text-subheading uppercase tracking-wide font-semibold">
              Rate
            </p>
            <div className="mt-1 text-[18px] font-bold text-heading leading-tight">
              {rateLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      {/* Services */}
      <SectionTitle title="Services" />
      <div className="px-4">
        <Card>
          {profile.services.length === 0 ? (
            <p className="text-[13px] text-subheading">
              Services not added yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {profile.services.map((s) => (
                <li key={s}>
                  <Tag tone="primary">{serviceLabel(s)}</Tag>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Care formats — skip block when empty */}
      {profile.care_formats.length > 0 && (
        <>
          <SectionTitle title="Work taken on" />
          <div className="px-4">
            <Card>
              <ul className="flex flex-wrap gap-1.5">
                {profile.care_formats.map((f) => (
                  <li key={f}>
                    <Tag tone="neutral">{careFormatLabel(f)}</Tag>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      {/* About */}
      <SectionTitle title="About" />
      <div className="px-4">
        <Card>
          <p className="text-[14px] text-heading whitespace-pre-line leading-relaxed">
            {profile.bio && profile.bio.trim().length > 0
              ? profile.bio
              : "This caregiver hasn't added a bio yet."}
          </p>
        </Card>
      </div>

      {/* Languages */}
      <SectionTitle title="Languages" />
      <div className="px-4">
        <Card>
          {profile.languages.length === 0 ? (
            <p className="text-[13px] text-subheading">
              Languages not added yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {profile.languages.map((l) => (
                <li key={l}>
                  <Tag tone="neutral">{l}</Tag>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Experience + travel */}
      <SectionTitle title="Experience" />
      <div className="px-4">
        <Card>
          <Row label="Experience">
            {profile.years_experience != null && profile.years_experience > 0
              ? `${profile.years_experience} years`
              : "—"}
          </Row>
          <Row label="Country">{country ?? "—"}</Row>
          <Row label="Driver">
            {profile.has_drivers_license ? "Yes" : "—"}
          </Row>
          <Row label="Own vehicle">
            {profile.has_own_vehicle ? "Yes" : "—"}
          </Row>
        </Card>
      </div>

      {/* Photos — skip block when zero */}
      {photos.length > 0 && (
        <>
          <SectionTitle title="Photos" />
          <div className="px-4">
            <PhotosGrid photos={photos} alt={name} />
          </div>
        </>
      )}

      {/* Reviews */}
      <SectionTitle title="Reviews" />
      <div className="px-4 space-y-3">
        {reviews.length === 0 ? (
          <Card>
            <p className="text-[13px] text-subheading">
              No reviews yet — be among the first to book.
            </p>
          </Card>
        ) : (
          reviews.map((r) => <ReviewCard key={r.id} r={r} />)
        )}
      </div>

      {/* Vetted block */}
      <SectionTitle title="Vetted by SpecialCarer" />
      <div className="px-4">
        <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid h-9 w-9 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700"
            >
              <IconCert />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold">
                Background-checked &amp; verified
              </p>
              <ul className="mt-2 space-y-1 text-[12.5px] text-emerald-900/90">
                <li className="flex items-center gap-2">
                  <IconCheck /> Identity verified
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck /> Background check cleared
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck /> Right-to-work confirmed
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Book CTA — only when NOT preview mode. */}
      {!preview && (
        <div
          className="fixed inset-x-0 bottom-[64px] z-30 bg-white/95 backdrop-blur border-t border-line px-4 py-3 sc-safe-bottom"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Link href={`/m/book/${profile.user_id}`} className="block">
            <Button size="lg" block>
              <span className="inline-flex items-center gap-2">
                Book this caregiver
                <IconChevronRight />
              </span>
            </Button>
          </Link>
        </div>
      )}

      {/* Spacer so the sticky CTA never overlaps last card. */}
      {!preview && <div className="h-20" aria-hidden />}

      <BottomNav active="home" />
    </main>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
      <dt className="text-[12.5px] text-subheading">{label}</dt>
      <dd className="text-[13.5px] font-semibold text-heading text-right">
        {children}
      </dd>
    </div>
  );
}

function PhotosGrid({
  photos,
  alt,
}: {
  photos: ApiCarerPhoto[];
  alt: string;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {photos.map((p) => (
        <li
          key={p.id}
          className="aspect-square rounded-card overflow-hidden border border-line bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.url}
            alt={alt}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ r }: { r: ApiCarerReview }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-bold text-heading truncate">
          {r.reviewer_name}
        </p>
        <Stars value={r.rating} />
      </div>
      {r.body && (
        <p className="mt-2 text-[13px] text-heading whitespace-pre-line">
          {r.body}
        </p>
      )}
      <p className="mt-2 text-[11.5px] text-subheading">
        {new Date(r.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </p>
    </Card>
  );
}

function SkeletonHero() {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div
          className="h-[88px] w-[88px] rounded-full bg-muted animate-pulse"
          aria-hidden
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-5 w-2/3 rounded bg-muted animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="border-t border-line mt-4 pt-3 space-y-2">
        <div className="h-3 w-1/4 rounded bg-muted animate-pulse" />
        <div className="h-5 w-1/3 rounded bg-muted animate-pulse" />
      </div>
    </Card>
  );
}

function SkeletonRow() {
  return (
    <Card>
      <div className="space-y-2">
        <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      </div>
    </Card>
  );
}
