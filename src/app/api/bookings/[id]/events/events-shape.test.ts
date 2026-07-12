/**
 * Field-level exposure tests for the GET /events response shaper. The
 * ops-internal verification fields must only reach admins.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shapeEvent } from "./route";
import type { VisitEventRow } from "../clock/clock-handler";

const FULL: VisitEventRow = {
  id: "evt-1",
  visit_id: "visit-1",
  carer_id: "carer-1",
  event_type: "clock_in",
  event_at: "2026-07-12T09:00:00.000Z",
  latitude: 51.5074,
  longitude: -0.1278,
  accuracy_metres: 12,
  client_reported_at: "2026-07-12T09:00:00.000Z",
  server_recorded_at: "2026-07-12T09:00:00.000Z",
  device_info: null,
  notes: null,
  photo_url: "carer-1/visit-1/evt-1.jpg",
  photo_verification_status: "pending",
  photo_similarity_score: 0.9,
  photo_verification_checked_at: null,
  geofence_status: "passed",
  distance_from_client_metres: 10,
  admin_override_by: "admin-9",
  admin_override_reason: "confirmed on-site, GPS drift from tower block",
  admin_override_at: "2026-07-12T09:01:00.000Z",
  verified_by_admin_id: "admin-9",
  created_at: "2026-07-12T09:00:00.000Z",
};

const OPS_INTERNAL = [
  "latitude",
  "longitude",
  "distance_from_client_metres",
  "admin_override_by",
  "admin_override_reason",
  "admin_override_at",
  "verified_by_admin_id",
  "photo_similarity_score",
  "photo_url",
] as const;

describe("shapeEvent", () => {
  it("admin sees the full row", () => {
    const out = shapeEvent(FULL, "admin");
    assert.deepEqual(out, FULL);
  });

  it("carer sees only the operational subset, no ops-internal PII", () => {
    const out = shapeEvent(FULL, "carer");
    assert.deepEqual(Object.keys(out).sort(), [
      "event_at",
      "event_type",
      "geofence_status",
      "id",
      "photo_verification_status",
    ]);
    for (const field of OPS_INTERNAL) {
      assert.ok(!(field in out), `carer must not see ${field}`);
    }
  });

  it("family sees only the visit timeline", () => {
    const out = shapeEvent(FULL, "family");
    assert.deepEqual(Object.keys(out).sort(), ["event_at", "event_type", "id"]);
    for (const field of OPS_INTERNAL) {
      assert.ok(!(field in out), `family must not see ${field}`);
    }
    assert.ok(!("geofence_status" in out));
    assert.ok(!("photo_verification_status" in out));
  });
});
