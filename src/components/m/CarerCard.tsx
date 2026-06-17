"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookingStateBadge,
  type BookingState,
} from "./BookingStateBadge";
import { isMobileRedesignEnabled } from "@/lib/mobile-redesign/flag";

/**
 * Shared carer card for the mobile redesign (PR-R1).
 *
 * Pure presentational component — no data fetching, no Supabase, no routing
 * logic beyond an optional `href`. Three layout variants share one data
 * contract so callers (carousels, grids, lists) render identical content:
 *
 *   - inline : ~140px fixed-width card for horizontal-scroll carousels
 *   - tile   : square card for responsive grids
 *   - list   : full-width row, avatar left / details right
 *
 * Gated behind NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED by its callers; the
 * component itself is inert until rendered. It deliberately does NOT replace
 * the existing CarerTile / RealCarerCard / search inline renderers.
 */

export type CarerCardData = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  headlineRate?: number | null; // £/hr
  distanceKm?: number | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  verified?: boolean;
  qualifications?: string[]; // e.g. ['NVQ L3', 'RMN']
};

export type CarerCardVariant = "inline" | "tile" | "list";

export type CarerCardProps = {
  carer: CarerCardData;
  variant: CarerCardVariant;
  onPress?: () => void;
  href?: string; // if set, renders as Link
  className?: string;
  // Optional booking-state badge (PR-R3). Rendered per-variant only when set
  // AND the mobile-redesign flag is on; otherwise the card is unchanged
  // (back-compat with PR-R1 call sites).
  bookingState?: BookingState;
};

/* ── formatting helpers (exported for tests) ─────────────────────────── */

export function formatRate(rate?: number | null): string | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  // Whole pounds drop the decimals; part-pounds keep two.
  const body = Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
  return `£${body}/hr`;
}

export function formatDistance(distanceKm?: number | null): string {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return "Online";
  return `${distanceKm.toFixed(1)} km away`;
}

export function formatRating(
  ratingAvg?: number | null,
  ratingCount?: number | null,
): string | null {
  if (ratingAvg == null || !Number.isFinite(ratingAvg)) return null;
  const avg = ratingAvg.toFixed(1);
  if (ratingCount == null || ratingCount <= 0) return `${avg} ★`;
  return `${avg} ★ (${ratingCount})`;
}

/**
 * Synthesise the accessible label, e.g.
 * "Sarah, 4.8 stars, 23 reviews, 2.4 km away, £18 per hour, verified".
 */
export function buildAriaLabel(carer: CarerCardData): string {
  const parts: string[] = [carer.displayName];

  if (carer.ratingAvg != null && Number.isFinite(carer.ratingAvg)) {
    parts.push(`${carer.ratingAvg.toFixed(1)} stars`);
    if (carer.ratingCount != null && carer.ratingCount > 0) {
      parts.push(
        `${carer.ratingCount} ${carer.ratingCount === 1 ? "review" : "reviews"}`,
      );
    }
  }

  if (carer.distanceKm != null && Number.isFinite(carer.distanceKm)) {
    parts.push(`${carer.distanceKm.toFixed(1)} km away`);
  } else {
    parts.push("online");
  }

  if (carer.headlineRate != null && Number.isFinite(carer.headlineRate)) {
    const body = Number.isInteger(carer.headlineRate)
      ? String(carer.headlineRate)
      : carer.headlineRate.toFixed(2);
    parts.push(`£${body} per hour`);
  }

  if (carer.verified) parts.push("verified");

  return parts.join(", ");
}

/* ── shared sub-pieces ───────────────────────────────────────────────── */

function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U"
  );
}

function Avatar({
  src,
  name,
  size,
  verified,
}: {
  src?: string | null;
  name: string;
  size: number;
  verified?: boolean;
}) {
  const badge = Math.max(14, Math.round(size * 0.32));
  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <div
        className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-primary-50 font-bold text-primary"
        style={{ fontSize: Math.round(size * 0.38) }}
      >
        {src ? (
          // Plain <img>: the card is presentational and may render in static
          // markup / tests where next/image's loader is unavailable.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          initialsOf(name)
        )}
      </div>
      {verified && (
        <span
          className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-brand-teal text-white ring-2 ring-white"
          style={{ width: badge, height: badge }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: badge * 0.6, height: badge * 0.6 }}
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}
    </div>
  );
}

function QualChips({ items }: { items: string[] }) {
  const top = items.slice(0, 2);
  if (top.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-mobile-xs">
      {top.map((q) => (
        <span
          key={q}
          className="inline-flex items-center rounded-pill bg-brand-cream px-mobile-sm py-mobile-xs text-[11px] font-semibold text-brand-ink"
        >
          {q}
        </span>
      ))}
    </div>
  );
}

function RatingLine({
  carer,
  className = "",
}: {
  carer: CarerCardData;
  className?: string;
}) {
  const rating = formatRating(carer.ratingAvg, carer.ratingCount);
  if (!rating) return null;
  return (
    <span className={`text-[12px] font-semibold text-brand-ink ${className}`}>
      {rating}
    </span>
  );
}

/* ── empty state ─────────────────────────────────────────────────────── */

function EmptyCard({
  variant,
  className,
}: {
  variant: CarerCardVariant;
  className: string;
}) {
  const base =
    "font-display grid place-items-center rounded-card bg-bg-card text-[13px] font-semibold text-subheading shadow-card-sm";
  const sizing =
    variant === "inline"
      ? "w-[140px] h-[176px] flex-none"
      : variant === "tile"
        ? "aspect-square w-full"
        : "w-full h-[88px]";
  return (
    <div
      className={`${base} ${sizing} ${className}`}
      role="note"
      aria-label="Carer unavailable"
    >
      Carer unavailable
    </div>
  );
}

/* ── variant bodies ──────────────────────────────────────────────────── */

function InlineBody({
  carer,
  bookingState,
}: {
  carer: CarerCardData;
  bookingState?: BookingState;
}) {
  const rate = formatRate(carer.headlineRate);
  return (
    <div className="flex w-[140px] flex-none flex-col items-center gap-mobile-sm p-mobile-md text-center">
      <div className="relative">
        <Avatar
          src={carer.avatarUrl}
          name={carer.displayName}
          size={64}
          verified={carer.verified}
        />
        {bookingState && (
          <span className="absolute -right-2 -top-2">
            <BookingStateBadge state={bookingState} size="sm" />
          </span>
        )}
      </div>
      <p className="w-full truncate text-[14px] font-bold text-brand-ink">
        {carer.displayName}
      </p>
      <RatingLine carer={carer} />
      <p className="text-[12px] font-semibold text-subheading">
        {formatDistance(carer.distanceKm)}
      </p>
      {rate && (
        <p className="text-[13px] font-bold text-brand-teal">{rate}</p>
      )}
    </div>
  );
}

function TileBody({
  carer,
  bookingState,
}: {
  carer: CarerCardData;
  bookingState?: BookingState;
}) {
  const rate = formatRate(carer.headlineRate);
  return (
    <div className="flex aspect-square w-full flex-col items-center gap-mobile-sm p-mobile-lg text-center">
      <Avatar
        src={carer.avatarUrl}
        name={carer.displayName}
        size={72}
        verified={carer.verified}
      />
      <p className="w-full truncate text-[15px] font-bold text-brand-ink">
        {carer.displayName}
      </p>
      {bookingState && (
        <BookingStateBadge state={bookingState} size="sm" />
      )}
      <RatingLine carer={carer} />
      <p className="text-[12px] font-semibold text-subheading">
        {formatDistance(carer.distanceKm)}
      </p>
      <div className="mt-auto flex w-full flex-col items-center gap-mobile-sm">
        <QualChips items={carer.qualifications ?? []} />
        {rate && (
          <p className="text-[14px] font-bold text-brand-teal">{rate}</p>
        )}
      </div>
    </div>
  );
}

function ListBody({
  carer,
  bookingState,
}: {
  carer: CarerCardData;
  bookingState?: BookingState;
}) {
  const rate = formatRate(carer.headlineRate);
  return (
    <div className="flex w-full items-center gap-mobile-md p-mobile-md">
      <Avatar
        src={carer.avatarUrl}
        name={carer.displayName}
        size={56}
        verified={carer.verified}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-mobile-xs">
        <div className="flex items-baseline justify-between gap-mobile-sm">
          <p className="truncate text-[15px] font-bold text-brand-ink">
            {carer.displayName}
          </p>
          {rate && (
            <span className="flex-none text-[14px] font-bold text-brand-teal">
              {rate}
            </span>
          )}
        </div>
        <div className="flex items-center gap-mobile-sm text-[12px] font-semibold text-subheading">
          <RatingLine carer={carer} />
          <span aria-hidden="true">·</span>
          <span>{formatDistance(carer.distanceKm)}</span>
        </div>
        {bookingState && (
          <BookingStateBadge state={bookingState} size="sm" />
        )}
        <QualChips items={carer.qualifications ?? []} />
      </div>
    </div>
  );
}

/* ── public component ────────────────────────────────────────────────── */

export function CarerCard({
  carer,
  variant,
  onPress,
  href,
  className = "",
  bookingState,
}: CarerCardProps) {
  if (!carer.displayName) {
    return <EmptyCard variant={variant} className={className} />;
  }

  // The badge is opt-in (bookingState set) and only surfaces under the
  // redesign flag; otherwise the card renders exactly as in PR-R1.
  const badgeState =
    bookingState && isMobileRedesignEnabled() ? bookingState : undefined;

  const shell =
    "font-display block rounded-card bg-bg-card shadow-card-sm transition active:scale-[0.99] sc-no-select";
  const sizing =
    variant === "inline"
      ? "flex-none"
      : variant === "tile"
        ? "w-full"
        : "w-full";

  const body =
    variant === "inline" ? (
      <InlineBody carer={carer} bookingState={badgeState} />
    ) : variant === "tile" ? (
      <TileBody carer={carer} bookingState={badgeState} />
    ) : (
      <ListBody carer={carer} bookingState={badgeState} />
    );

  const ariaLabel = buildAriaLabel(carer);
  const classes = `${shell} ${sizing} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        aria-label={ariaLabel}
        data-variant={variant}
        onClick={onPress}
      >
        {body}
      </Link>
    );
  }

  if (onPress) {
    return (
      <button
        type="button"
        className={`${classes} text-left`}
        aria-label={ariaLabel}
        data-variant={variant}
        onClick={onPress}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={classes}
      aria-label={ariaLabel}
      role="group"
      data-variant={variant}
    >
      {body}
    </div>
  );
}

/* ── loading skeletons ───────────────────────────────────────────────── */

export function CarerCardSkeleton({
  variant,
  className = "",
}: {
  variant: CarerCardVariant;
  className?: string;
}) {
  const shell =
    "rounded-card bg-bg-card shadow-card-sm overflow-hidden";
  const block = "animate-pulse rounded-full bg-muted";
  const bar = "animate-pulse rounded-pill bg-muted";

  if (variant === "inline") {
    return (
      <div
        className={`${shell} w-[140px] flex-none p-mobile-md ${className}`}
        aria-hidden="true"
        data-variant="inline"
        data-skeleton="true"
      >
        <div className="flex flex-col items-center gap-mobile-sm">
          <div className={`${block} h-16 w-16`} />
          <div className={`${bar} h-3 w-20`} />
          <div className={`${bar} h-3 w-14`} />
          <div className={`${bar} h-3 w-16`} />
        </div>
      </div>
    );
  }

  if (variant === "tile") {
    return (
      <div
        className={`${shell} aspect-square w-full p-mobile-lg ${className}`}
        aria-hidden="true"
        data-variant="tile"
        data-skeleton="true"
      >
        <div className="flex h-full flex-col items-center gap-mobile-sm">
          <div className={`${block} h-[72px] w-[72px]`} />
          <div className={`${bar} h-3 w-24`} />
          <div className={`${bar} h-3 w-16`} />
          <div className="mt-auto flex w-full justify-center gap-mobile-sm">
            <div className={`${bar} h-5 w-12`} />
            <div className={`${bar} h-5 w-12`} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${shell} w-full p-mobile-md ${className}`}
      aria-hidden="true"
      data-variant="list"
      data-skeleton="true"
    >
      <div className="flex items-center gap-mobile-md">
        <div className={`${block} h-14 w-14`} />
        <div className="flex flex-1 flex-col gap-mobile-sm">
          <div className={`${bar} h-3 w-1/2`} />
          <div className={`${bar} h-3 w-2/3`} />
          <div className={`${bar} h-5 w-24`} />
        </div>
      </div>
    </div>
  );
}

export default CarerCard;
