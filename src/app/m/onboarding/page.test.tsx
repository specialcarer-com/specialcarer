/**
 * <OnboardingPage> render tests (PR-R5).
 *
 * Static-markup harness (node:test + react-dom/server, same pattern as
 * src/components/m/PostJobFab.test.tsx and src/components/m/CarerCard.test.tsx).
 *
 * We can't import the page component directly because it is a Client Component
 * that uses `useRouter` from `next/navigation` (which requires a Next runtime).
 * Instead, we assert the static slide-data contract — both legacy fields
 * (title/body/hook) and the redesign fields (redesignHeadline/redesignSegment)
 * are present and non-empty for every slide, and at least one slide carries
 * the `comingSoon` pill. This keeps the carousel from regressing R5 copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(__dirname, "page.tsx");
const SRC = readFileSync(PAGE_PATH, "utf8");

test("R5: redesign branch is gated by isMobileRedesignEnabled()", () => {
  assert.match(
    SRC,
    /isMobileRedesignEnabled\(\)/,
    "onboarding page must read the redesign flag at runtime"
  );
  assert.match(
    SRC,
    /if \(redesign\)\s*\{\s*return <RedesignedOnboarding/,
    "redesign must branch on the flag before the legacy fallback"
  );
});

test("R5: data-testid is exposed on the redesigned layout", () => {
  assert.match(SRC, /data-testid="onboarding-redesign"/);
});

test("R5: each slide carries both legacy and redesign copy", () => {
  // Pull the SLIDES array as a substring and assert each slide object
  // has all five copy fields. We avoid evaluating TS at test time; a
  // string-level check is enough to catch accidental field removal.
  const slidesBlock = SRC.match(/const SLIDES: Slide\[\] = \[[\s\S]+?\n\];/);
  assert.ok(slidesBlock, "SLIDES array must exist");
  const block = slidesBlock[0];

  // 3 slides expected.
  const objectCount = (block.match(/\n\s{2}\{/g) || []).length;
  assert.equal(objectCount, 3, "expected exactly 3 onboarding slides");

  for (const key of ["title", "body", "hook", "redesignHeadline", "redesignSegment"]) {
    const matches = block.match(new RegExp(`${key}:`, "g")) || [];
    assert.equal(
      matches.length,
      3,
      `every slide must define ${key} (found ${matches.length})`
    );
  }
});

test("R5: 'TEEN & SEN SUPPORT' Phone A reference slide is present", () => {
  // The IMG_6537.jpeg reference slide. Keeping this hard-coded ensures
  // the Phone A design copy survives future edits.
  assert.match(SRC, /redesignSegment: "TEEN & SEN SUPPORT"/);
  assert.match(SRC, /comingSoon: true/);
});

test("R5: legacy layout still renders the navy hook line", () => {
  assert.match(
    SRC,
    /text-secondary font-semibold/,
    "legacy layout must keep the secondary-navy hook line"
  );
});

test("R5: full-bleed gradient overlay is applied in the redesign", () => {
  // Bottom-up gradient on the photo — the most fragile visual contract,
  // so we lock the rgba stops into the test.
  assert.match(SRC, /rgba\(15,\s*20,\s*22,\s*0\.9\)/);
});
