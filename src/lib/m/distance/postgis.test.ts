/**
 * getCarersWithinRadius() unit tests (PR-R3) with a stubbed Supabase RPC.
 *
 * The flag (src/lib/mobile-redesign/flag.ts) snapshots the env var at module
 * load, so we set NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED before dynamically
 * importing the helper, then drive the RPC with an in-memory stub.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import type {
  getCarersWithinRadius as GetFn,
  RadiusRpcClient,
} from "./postgis";

process.env.NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED = "true";

let getCarersWithinRadius: typeof GetFn;

before(async () => {
  ({ getCarersWithinRadius } = await import("./postgis"));
});

// Origin: central London. Two carers at known offsets.
const ORIGIN = { lat: 51.5074, lng: -0.1276 };

function stubClient(rows: Record<string, unknown>[]): RadiusRpcClient {
  return {
    async rpc(_fn, _args) {
      return { data: rows as never, error: null };
    },
  };
}

function errClient(message: string): RadiusRpcClient {
  return {
    async rpc() {
      return { data: null, error: { message } };
    },
  };
}

test("returns rows tagged with distance_m, nearest-first", async () => {
  // Near carer ~0 km, far carer ~1 deg lat north (~111 km).
  const near = { user_id: "near", home_lat: 51.5074, home_lng: -0.1276 };
  const far = { user_id: "far", home_lat: 52.5074, home_lng: -0.1276 };
  // Supply out of order to prove the helper sorts.
  const out = await getCarersWithinRadius({
    client: stubClient([far, near]),
    lat: ORIGIN.lat,
    lng: ORIGIN.lng,
    meters: 200_000,
  });

  assert.ok(out, "flag on → non-null");
  assert.equal(out!.length, 2);
  assert.equal(out![0].user_id, "near");
  assert.equal(out![1].user_id, "far");
  assert.ok(out![0].distance_m < 1000, "near carer is sub-km");
  assert.ok(
    out![1].distance_m > 100_000 && out![1].distance_m < 120_000,
    "far carer ~111 km",
  );
});

test("rows without coordinates sort last with infinite distance", async () => {
  const located = { user_id: "located", home_lat: 51.5074, home_lng: -0.1276 };
  const noCoords = { user_id: "noCoords", home_lat: null, home_lng: null };
  const out = await getCarersWithinRadius({
    client: stubClient([noCoords, located]),
    lat: ORIGIN.lat,
    lng: ORIGIN.lng,
    meters: 50_000,
  });
  assert.equal(out![0].user_id, "located");
  assert.equal(out![1].user_id, "noCoords");
  assert.equal(out![1].distance_m, Number.POSITIVE_INFINITY);
});

test("passes through the full profile row", async () => {
  const row = {
    user_id: "x",
    home_lat: 51.5,
    home_lng: -0.12,
    display_name: "Sarah",
    rating_avg: 4.8,
  };
  const out = await getCarersWithinRadius({
    client: stubClient([row]),
    lat: ORIGIN.lat,
    lng: ORIGIN.lng,
    meters: 50_000,
  });
  assert.equal(out![0].display_name, "Sarah");
  assert.equal(out![0].rating_avg, 4.8);
});

test("empty result set yields an empty array", async () => {
  const out = await getCarersWithinRadius({
    client: stubClient([]),
    lat: ORIGIN.lat,
    lng: ORIGIN.lng,
    meters: 50_000,
  });
  assert.deepEqual(out, []);
});

test("RPC error throws", async () => {
  await assert.rejects(
    () =>
      getCarersWithinRadius({
        client: errClient("boom"),
        lat: ORIGIN.lat,
        lng: ORIGIN.lng,
        meters: 50_000,
      }),
    /carers_within_radius failed: boom/,
  );
});
