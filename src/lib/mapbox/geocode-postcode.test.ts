/**
 * Tests for geocodePostcode's real-mode (non-stub) fetch behaviour.
 *
 * The module reads MAPBOX_PUBLIC_TOKEN at import time to decide stub vs real
 * mode, so we set a real-looking token *before* a dynamic import and mock
 * global.fetch. Manual fetch mocking — same pattern as src/lib/push/expo.test.ts.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Set a non-stub token so the module loads in real (network) mode.
process.env.MAPBOX_PUBLIC_TOKEN = "pk.test_token";

type GeocodeModule = typeof import("./server");
let mod: GeocodeModule;

before(async () => {
  mod = await import("./server");
});

function mapboxResponse(center: [number, number]) {
  return new Response(
    JSON.stringify({
      features: [
        {
          center, // [lng, lat]
          place_name: "Test Place",
          context: [{ id: "place.1", text: "London" }],
        },
      ],
    }),
    { status: 200 },
  );
}

describe("geocodePostcode (real mode)", () => {
  it("returns lat/lng on a successful Mapbox response", async () => {
    const originalFetch = global.fetch;
    let calledUrl = "";
    global.fetch = (async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return mapboxResponse([-0.1419, 51.5014]);
    }) as typeof fetch;
    try {
      const res = await mod.geocodePostcode("EC1A 1AA", "GB");
      assert.ok(res, "expected a result");
      assert.equal(res!.lat, 51.5014);
      assert.equal(res!.lng, -0.1419);
      assert.equal(res!.city, "London");
      // Hits the GB-scoped postcode endpoint with the token.
      assert.match(calledUrl, /api\.mapbox\.com\/geocoding/);
      assert.match(calledUrl, /country=gb/);
      assert.match(calledUrl, /access_token=pk\.test_token/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns null on a 404 from Mapbox", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response("not found", { status: 404 })) as typeof fetch;
    try {
      // Use a fresh postcode so the in-process cache doesn't short-circuit.
      const res = await mod.geocodePostcode("EC2A 2BB", "GB");
      assert.equal(res, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns null when fetch throws (network error)", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    try {
      const res = await mod.geocodePostcode("EC3A 3CC", "GB");
      assert.equal(res, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("caches results so a repeated lookup skips fetch", async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = (async () => {
      calls += 1;
      return mapboxResponse([-2.2453, 53.4794]);
    }) as typeof fetch;
    try {
      const a = await mod.geocodePostcode("M2 2AA", "GB");
      const b = await mod.geocodePostcode("M2 2AA", "GB");
      assert.ok(a && b);
      assert.equal(calls, 1, "second lookup should be served from cache");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
