/**
 * Tests for the search page's query-param builder.
 *
 * Proves the gap-19 origin plumbing: when the page has a geocoded origin it
 * passes originLat/originLng to the search API (so distance_km is populated and
 * "Nearest" sorts for real); when it doesn't, search runs without them and
 * isn't broken. Pure unit — no React render, per the repo's page-test
 * convention (see ../memberships/page.test.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCarerSearchParams } from "./search-params";

describe("buildCarerSearchParams", () => {
  it("includes originLat/originLng when an origin is supplied", () => {
    const p = buildCarerSearchParams({
      q: "",
      service: null,
      origin: { lat: 51.5074, lng: -0.1276 },
    });
    assert.equal(p.get("originLat"), "51.5074");
    assert.equal(p.get("originLng"), "-0.1276");
    assert.equal(p.get("limit"), "50");
  });

  it("omits origin params entirely when there is no origin", () => {
    const p = buildCarerSearchParams({ q: "", service: null, origin: null });
    assert.equal(p.has("originLat"), false);
    assert.equal(p.has("originLng"), false);
    // Search still works — just without distances.
    assert.equal(p.get("limit"), "50");
  });

  it("carries q and service alongside the origin", () => {
    const p = buildCarerSearchParams({
      q: "  aisha  ",
      service: "elderly_care",
      origin: { lat: 53.4794, lng: -2.2453 },
    });
    assert.equal(p.get("q"), "aisha"); // trimmed
    assert.equal(p.get("service"), "elderly_care");
    assert.equal(p.get("originLat"), "53.4794");
    assert.equal(p.get("originLng"), "-2.2453");
  });

  it("drops blank q and null service", () => {
    const p = buildCarerSearchParams({
      q: "   ",
      service: null,
      origin: null,
    });
    assert.equal(p.has("q"), false);
    assert.equal(p.has("service"), false);
  });
});
