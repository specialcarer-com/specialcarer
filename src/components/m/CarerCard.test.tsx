/**
 * <CarerCard> render tests (PR-R1).
 *
 * Renders to static markup (node:test + react-dom/server, the same harness as
 * TimelineEventCard.test.tsx) and asserts content per variant, the loading
 * skeleton snapshot, the empty state, and the synthesised aria-label.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CarerCard,
  CarerCardSkeleton,
  buildAriaLabel,
  formatRate,
  formatDistance,
  formatRating,
  type CarerCardData,
  type CarerCardVariant,
} from "./CarerCard";

const sarah: CarerCardData = {
  id: "c1",
  displayName: "Sarah",
  avatarUrl: null,
  headlineRate: 18,
  distanceKm: 2.4,
  ratingAvg: 4.8,
  ratingCount: 23,
  verified: true,
  qualifications: ["NVQ L3", "RMN", "Ignored"],
};

const VARIANTS: CarerCardVariant[] = ["inline", "tile", "list"];

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node);
}

test("renders name, rate, distance and rating for every variant", () => {
  for (const variant of VARIANTS) {
    const html = render(h(CarerCard, { carer: sarah, variant }));
    assert.match(html, /Sarah/, `${variant}: name`);
    assert.match(html, /£18\/hr/, `${variant}: rate`);
    assert.match(html, /2\.4 km away/, `${variant}: distance`);
    assert.match(html, /4\.8 ★ \(23\)/, `${variant}: rating`);
    assert.match(html, new RegExp(`data-variant="${variant}"`), `${variant}: marker`);
  }
});

test("shows only the top two qualifications as chips", () => {
  const html = render(h(CarerCard, { carer: sarah, variant: "list" }));
  assert.match(html, /NVQ L3/);
  assert.match(html, /RMN/);
  assert.ok(!html.includes("Ignored"), "third qualification dropped");
});

test('distance falls back to "Online" when null', () => {
  const online: CarerCardData = { ...sarah, distanceKm: null };
  const html = render(h(CarerCard, { carer: online, variant: "list" }));
  assert.match(html, /Online/);
  assert.ok(!html.includes("km away"));
});

test("renders as a link when href is set", () => {
  const html = render(h(CarerCard, { carer: sarah, variant: "list", href: "/m/x" }));
  assert.match(html, /<a /);
  assert.match(html, /href="\/m\/x"/);
});

test("renders empty state when displayName is blank", () => {
  const empty: CarerCardData = { id: "x", displayName: "" };
  const html = render(h(CarerCard, { carer: empty, variant: "tile" }));
  assert.match(html, /Carer unavailable/);
  assert.match(html, /aria-label="Carer unavailable"/);
});

test("aria-label synthesises name, rating, reviews, distance, rate, verified", () => {
  const label = buildAriaLabel(sarah);
  assert.equal(
    label,
    "Sarah, 4.8 stars, 23 reviews, 2.4 km away, £18 per hour, verified",
  );

  const html = render(h(CarerCard, { carer: sarah, variant: "inline" }));
  assert.match(html, /aria-label="Sarah, 4\.8 stars, 23 reviews/);
});

test("aria-label degrades gracefully for sparse data", () => {
  const sparse: CarerCardData = { id: "y", displayName: "Mary", distanceKm: null };
  assert.equal(buildAriaLabel(sparse), "Mary, online");
});

test("formatters handle null and part-pound / single-review cases", () => {
  assert.equal(formatRate(18), "£18/hr");
  assert.equal(formatRate(22.5), "£22.50/hr");
  assert.equal(formatRate(null), null);
  assert.equal(formatDistance(null), "Online");
  assert.equal(formatDistance(2.4), "2.4 km away");
  assert.equal(formatRating(4.9, 1), "4.9 ★ (1)");
  assert.equal(formatRating(4.9, 0), "4.9 ★");
  assert.equal(formatRating(null, 10), null);
});

test("bookingState renders no badge when the redesign flag is off (default)", () => {
  // The test process runs without NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED, so the
  // flag is off and the card must be byte-identical to one without a state.
  for (const variant of VARIANTS) {
    const withState = render(
      h(CarerCard, { carer: sarah, variant, bookingState: "in_progress" }),
    );
    const without = render(h(CarerCard, { carer: sarah, variant }));
    assert.equal(withState, without, `${variant}: flag-off no-op`);
    assert.ok(
      !withState.includes("data-booking-state"),
      `${variant}: no badge marker`,
    );
  }
});

test("loading skeleton snapshot is stable for every variant", () => {
  const snapshots: Record<string, string> = {};
  for (const variant of VARIANTS) {
    const html = render(h(CarerCardSkeleton, { variant }));
    assert.match(html, /data-skeleton="true"/, `${variant}: marker`);
    assert.match(html, new RegExp(`data-variant="${variant}"`), `${variant}: variant`);
    assert.match(html, /animate-pulse/, `${variant}: pulse`);
    assert.match(html, /aria-hidden="true"/, `${variant}: hidden from a11y tree`);
    snapshots[variant] = html;
  }

  assert.equal(
    snapshots.inline,
    '<div class="rounded-card bg-bg-card shadow-card-sm overflow-hidden w-[140px] flex-none p-mobile-md " aria-hidden="true" data-variant="inline" data-skeleton="true"><div class="flex flex-col items-center gap-mobile-sm"><div class="animate-pulse rounded-full bg-muted h-16 w-16"></div><div class="animate-pulse rounded-pill bg-muted h-3 w-20"></div><div class="animate-pulse rounded-pill bg-muted h-3 w-14"></div><div class="animate-pulse rounded-pill bg-muted h-3 w-16"></div></div></div>',
  );
});
