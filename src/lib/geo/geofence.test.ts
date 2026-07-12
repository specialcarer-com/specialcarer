/**
 * Unit tests for the pure geofence evaluator.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateGeofence,
  haversineMetres,
  DEFAULT_GEOFENCE_THRESHOLD_METRES,
  LOW_ACCURACY_THRESHOLD_METRES,
  type Coords,
} from "./geofence";

// A reference point (Buckingham Palace) and points at known offsets from it.
const CLIENT: Coords = { lat: 51.501364, lng: -0.14189 };

/**
 * Offset a coordinate north by a number of metres. 1 degree of latitude is
 * ~111,320 m, so this gives a precise, axis-aligned displacement for tests.
 */
function offsetNorth(from: Coords, metres: number): Coords {
  return { lat: from.lat + metres / 111_320, lng: from.lng };
}

describe("haversineMetres", () => {
  it("is ~0 for identical points", () => {
    assert.ok(haversineMetres(CLIENT, CLIENT) < 1e-6);
  });

  it("measures a known north offset within 1% tolerance", () => {
    const d = haversineMetres(CLIENT, offsetNorth(CLIENT, 100));
    assert.ok(Math.abs(d - 100) < 1, `expected ~100m, got ${d}`);
  });
});

describe("evaluateGeofence", () => {
  it("passes when the carer is well inside the radius", () => {
    const r = evaluateGeofence({
      carerCoords: offsetNorth(CLIENT, 20),
      clientCoords: CLIENT,
    });
    assert.equal(r.status, "passed");
    assert.ok(r.distanceMetres != null && r.distanceMetres < 50);
  });

  it("fails when the carer is well outside the radius", () => {
    const r = evaluateGeofence({
      carerCoords: offsetNorth(CLIENT, 500),
      clientCoords: CLIENT,
    });
    assert.equal(r.status, "failed");
    assert.ok(r.distanceMetres != null && r.distanceMetres > 50);
  });

  it("passes at (just inside) the exact 50 m boundary", () => {
    const r = evaluateGeofence({
      carerCoords: offsetNorth(CLIENT, 49.9),
      clientCoords: CLIENT,
    });
    assert.equal(r.status, "passed");
    assert.equal(r.thresholdMetres, DEFAULT_GEOFENCE_THRESHOLD_METRES);
  });

  it("fails just past the 50 m boundary", () => {
    const r = evaluateGeofence({
      carerCoords: offsetNorth(CLIENT, 50.5),
      clientCoords: CLIENT,
    });
    assert.equal(r.status, "failed");
  });

  it("treats exactly-at-threshold distance as passed (<=)", () => {
    // Force a distance of exactly the threshold via a custom threshold.
    const carer = offsetNorth(CLIENT, 30);
    const distance = haversineMetres(carer, CLIENT);
    const r = evaluateGeofence({
      carerCoords: carer,
      clientCoords: CLIENT,
      thresholdMetres: distance,
    });
    assert.equal(r.status, "passed");
  });

  it("returns no_client_address when the client has no coords", () => {
    const r = evaluateGeofence({
      carerCoords: CLIENT,
      clientCoords: null,
    });
    assert.equal(r.status, "no_client_address");
    assert.equal(r.distanceMetres, null);
  });

  it("returns no_carer_location when the carer has no coords", () => {
    const r = evaluateGeofence({
      carerCoords: null,
      clientCoords: CLIENT,
    });
    assert.equal(r.status, "no_carer_location");
    assert.equal(r.distanceMetres, null);
  });

  it("rejects out-of-range coords as missing", () => {
    const r = evaluateGeofence({
      carerCoords: { lat: 200, lng: 0 },
      clientCoords: CLIENT,
    });
    assert.equal(r.status, "no_carer_location");
  });

  it("flags low accuracy without changing a passing status", () => {
    const r = evaluateGeofence({
      carerCoords: offsetNorth(CLIENT, 10),
      clientCoords: CLIENT,
      accuracyMetres: LOW_ACCURACY_THRESHOLD_METRES + 50,
    });
    assert.equal(r.status, "passed");
    assert.equal(r.lowAccuracy, true);
  });

  it("does not flag low accuracy for a tight fix", () => {
    const r = evaluateGeofence({
      carerCoords: offsetNorth(CLIENT, 10),
      clientCoords: CLIENT,
      accuracyMetres: 8,
    });
    assert.equal(r.lowAccuracy, false);
  });

  it("honours a custom threshold", () => {
    const carer = offsetNorth(CLIENT, 120);
    assert.equal(
      evaluateGeofence({ carerCoords: carer, clientCoords: CLIENT }).status,
      "failed",
    );
    assert.equal(
      evaluateGeofence({
        carerCoords: carer,
        clientCoords: CLIENT,
        thresholdMetres: 200,
      }).status,
      "passed",
    );
  });
});
