/**
 * Tests for the geocode origin handler.
 *
 * Pure handler driven with injected geocode + saved-postcode fns, so we assert
 * the origin-priority logic without next/headers, Supabase, or the network.
 * Pattern mirrors src/app/api/m/carers/search/route.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleGeocode,
  type GeocodeFn,
  type GeocodeHandlerBody,
} from "./geocode-handler";

const LONDON = { lat: 51.5014, lng: -0.1419 };
const MANCHESTER = { lat: 53.4794, lng: -2.2453 };

/** A geocode fn that returns fixed coords for known postcodes, null otherwise. */
function fakeGeocode(
  table: Record<string, { lat: number; lng: number }>,
): { fn: GeocodeFn; calls: Array<{ postcode: string; country: string | null }> } {
  const calls: Array<{ postcode: string; country: string | null }> = [];
  const fn: GeocodeFn = async (postcode, country) => {
    calls.push({ postcode, country });
    return table[postcode] ?? null;
  };
  return { fn, calls };
}

function originOf(body: GeocodeHandlerBody) {
  return body.origin;
}

describe("handleGeocode", () => {
  it("geocodes explicit input postcode and marks source=input", async () => {
    const { fn, calls } = fakeGeocode({ "SW1A 1AA": LONDON });
    const res = await handleGeocode({
      inputPostcode: "sw1a1aa",
      geocode: fn,
      getSavedPostcode: async () => {
        throw new Error("should not read saved postcode when input is valid");
      },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(originOf(res.body), {
      lat: LONDON.lat,
      lng: LONDON.lng,
      source: "input",
      postcode: "SW1A 1AA",
    });
    // Normalised before geocoding, country inferred as GB.
    assert.deepEqual(calls, [{ postcode: "SW1A 1AA", country: "GB" }]);
  });

  it("falls back to saved postcode when input is empty (source=profile)", async () => {
    const { fn } = fakeGeocode({ "M1 1AE": MANCHESTER });
    const res = await handleGeocode({
      inputPostcode: null,
      geocode: fn,
      getSavedPostcode: async () => "m11ae",
    });
    assert.deepEqual(originOf(res.body), {
      lat: MANCHESTER.lat,
      lng: MANCHESTER.lng,
      source: "profile",
      postcode: "M1 1AE",
    });
  });

  it("returns null origin when there is no input and no saved postcode", async () => {
    const { fn, calls } = fakeGeocode({});
    const res = await handleGeocode({
      inputPostcode: "   ",
      geocode: fn,
      getSavedPostcode: async () => null,
    });
    assert.equal(originOf(res.body), null);
    assert.equal(calls.length, 0, "never geocodes when nothing to resolve");
  });

  it("does not fall through to saved postcode when input is set but ungeocodable", async () => {
    // The user asked for a specific place; if Mapbox can't find it we return
    // no origin rather than silently measuring from their saved address.
    const { fn } = fakeGeocode({ "M1 1AE": MANCHESTER }); // saved would resolve
    const res = await handleGeocode({
      inputPostcode: "SW1A 1AA", // valid shape, but not in the table -> null
      geocode: fn,
      getSavedPostcode: async () => "m11ae",
    });
    assert.equal(originOf(res.body), null);
  });

  it("skips geocoding for an invalid input postcode shape", async () => {
    const { fn, calls } = fakeGeocode({});
    const res = await handleGeocode({
      inputPostcode: "not-a-postcode!!",
      geocode: fn,
      getSavedPostcode: async () => null,
    });
    assert.equal(originOf(res.body), null);
    assert.equal(calls.length, 0);
  });

  it("ignores an invalid saved postcode rather than geocoding garbage", async () => {
    const { fn, calls } = fakeGeocode({});
    const res = await handleGeocode({
      inputPostcode: null,
      geocode: fn,
      getSavedPostcode: async () => "garbage",
    });
    assert.equal(originOf(res.body), null);
    assert.equal(calls.length, 0);
  });
});
