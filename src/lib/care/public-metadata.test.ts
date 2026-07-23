import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCaregiverMetadata } from "./public-metadata";
import type { CaregiverProfileFull } from "./profile";

/**
 * Integration-ish coverage for the unauthenticated /caregiver/[id] surface:
 * the page calls getPublicCaregiverProfile (which already enforces GB-only +
 * published) and feeds the result straight into buildCaregiverMetadata. Here
 * we assert the metadata shape a crawler would see — og:title present for a
 * live carer, generic fallback otherwise.
 */

function profile(overrides: Partial<CaregiverProfileFull> = {}): CaregiverProfileFull {
  return {
    user_id: "11111111-1111-1111-1111-111111111111",
    public_slug: "priya-k-7f3a",
    display_name: "Priya Kaur",
    headline: "Compassionate elderly carer",
    bio: "Ten years supporting older adults at home.",
    city: "Manchester",
    region: null,
    country: "GB",
    postcode: null,
    hide_precise_location: true,
    services: ["elderly_care"],
    care_formats: ["visiting"],
    hourly_rate_cents: 2200,
    weekly_rate_cents: null,
    currency: "GBP",
    years_experience: 10,
    languages: ["English"],
    max_radius_km: 10,
    photo_url: "https://cdn.example.com/priya.jpg",
    is_published: true,
    rating_avg: 4.9,
    rating_count: 12,
    gender: null,
    has_drivers_license: true,
    has_own_vehicle: true,
    tags: [],
    certifications: [],
    ...overrides,
  };
}

describe("buildCaregiverMetadata (public /caregiver/[id])", () => {
  it("emits an og:title for a published GB carer", () => {
    const meta = buildCaregiverMetadata(profile());
    assert.equal(meta.title, "Priya Kaur — Elderly Care on SpecialCarer");
    assert.equal(meta.openGraph?.title, "Priya Kaur — Elderly Care on SpecialCarer");
    const og = meta.openGraph as Record<string, unknown>;
    assert.equal(og.type, "profile");
    const tw = meta.twitter as Record<string, unknown>;
    assert.equal(tw.card, "summary_large_image");
  });

  it("uses the carer's photo as og:image when present", () => {
    const meta = buildCaregiverMetadata(profile());
    const images = meta.openGraph?.images as { url: string }[];
    assert.equal(images[0].url, "https://cdn.example.com/priya.jpg");
  });

  it("falls back to the brand card when no photo", () => {
    const meta = buildCaregiverMetadata(profile({ photo_url: null }));
    const images = meta.openGraph?.images as { url: string }[];
    assert.equal(images[0].url, "/brand/og-image.png");
  });

  it("builds the canonical /c/<slug> url", () => {
    const meta = buildCaregiverMetadata(profile());
    assert.match(String(meta.alternates?.canonical), /\/c\/priya-k-7f3a$/);
  });

  it("returns a generic title when the carer is missing (404 / non-GB)", () => {
    const meta = buildCaregiverMetadata(null);
    assert.equal(meta.title, "Caregiver — SpecialCarer");
    assert.equal(meta.openGraph, undefined);
  });

  it("truncates a long bio excerpt to 160 chars", () => {
    const longBio = "x".repeat(400);
    const meta = buildCaregiverMetadata(
      profile({ headline: null, bio: longBio }),
    );
    assert.ok(String(meta.description).length <= 160);
  });
});
