/**
 * <CarerCard> booking-state badge tests with the redesign flag ON (PR-R3).
 *
 * The flag (src/lib/mobile-redesign/flag.ts) snapshots the env var at module
 * load, so this file sets NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED *before*
 * dynamically importing the card. Kept in its own file so it doesn't perturb
 * the flag-off assertions in CarerCard.test.tsx (separate process per file).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  CarerCard as CarerCardType,
  CarerCardData,
  CarerCardVariant,
} from "./CarerCard";

process.env.NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED = "true";

let CarerCard: typeof CarerCardType;

before(async () => {
  ({ CarerCard } = await import("./CarerCard"));
});

const sarah: CarerCardData = {
  id: "c1",
  displayName: "Sarah",
  headlineRate: 18,
  distanceKm: 2.4,
  ratingAvg: 4.8,
  ratingCount: 23,
  verified: true,
};

const VARIANTS: CarerCardVariant[] = ["inline", "tile", "list"];

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node);
}

test("renders the booking-state badge for every variant when flag is on", () => {
  for (const variant of VARIANTS) {
    const html = render(
      h(CarerCard, { carer: sarah, variant, bookingState: "in_progress" }),
    );
    assert.match(
      html,
      /data-booking-state="in_progress"/,
      `${variant}: badge marker`,
    );
    assert.match(html, /In progress now/, `${variant}: badge label`);
  }
});

test("no badge when bookingState is omitted even with flag on", () => {
  const html = render(h(CarerCard, { carer: sarah, variant: "list" }));
  assert.ok(!html.includes("data-booking-state"));
});
