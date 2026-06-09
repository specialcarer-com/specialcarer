/**
 * Tests for the go-online status handler.
 *
 * Drives the pure handler with a stubbed RPC client so we can assert
 * validation, clamping, RPC argument shape, and response mapping without
 * spinning up next/headers + cookies. Mirrors the convention in
 * src/app/api/m/carers/search/route.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleOnlineStatus,
  parseOnlineStatusBody,
  type OnlineStatus,
  type OnlineStatusClient,
} from "./online-status-handler";

type RpcCall = { p_online: boolean; p_radius_km: number | null };

function makeClient(opts: {
  data?: OnlineStatus[] | OnlineStatus | null;
  error?: { message: string } | null;
  calls?: RpcCall[];
}): OnlineStatusClient {
  return {
    async rpc(_fn, args) {
      opts.calls?.push(args);
      return {
        data: opts.data === undefined ? [] : opts.data,
        error: opts.error ?? null,
      };
    },
  };
}

const ONLINE_ROW: OnlineStatus = {
  is_online: true,
  last_online_at: "2026-06-09T20:00:00.000Z",
  online_radius_km: 5,
};

describe("parseOnlineStatusBody", () => {
  it("rejects a missing online flag", () => {
    const r = parseOnlineStatusBody({});
    assert.equal(r.ok, false);
  });

  it("rejects a non-boolean online flag", () => {
    const r = parseOnlineStatusBody({ online: "yes" });
    assert.equal(r.ok, false);
  });

  it("accepts online with no radius (radius stays null)", () => {
    const r = parseOnlineStatusBody({ online: true });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.radius_km, null);
  });

  it("clamps radius above 20 to 20", () => {
    const r = parseOnlineStatusBody({ online: true, radius_km: 99 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.radius_km, 20);
  });

  it("clamps radius below 1 to 1", () => {
    const r = parseOnlineStatusBody({ online: true, radius_km: 0 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.radius_km, 1);
  });

  it("rounds a fractional radius", () => {
    const r = parseOnlineStatusBody({ online: false, radius_km: 7.6 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.radius_km, 8);
  });

  it("rejects a non-numeric radius", () => {
    const r = parseOnlineStatusBody({ online: true, radius_km: "wide" });
    assert.equal(r.ok, false);
  });
});

describe("handleOnlineStatus", () => {
  it("toggles online and forwards the RPC args", async () => {
    const calls: RpcCall[] = [];
    const client = makeClient({ data: [ONLINE_ROW], calls });
    const res = await handleOnlineStatus({
      client,
      body: { online: true, radius_km: 10 },
    });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    assert.deepEqual(calls[0], { p_online: true, p_radius_km: 10 });
    assert.equal(res.body.status.is_online, true);
    assert.equal(res.body.status.online_radius_km, 5);
  });

  it("toggles offline (online=false) and returns the row", async () => {
    const calls: RpcCall[] = [];
    const offlineRow: OnlineStatus = { ...ONLINE_ROW, is_online: false };
    const client = makeClient({ data: [offlineRow], calls });
    const res = await handleOnlineStatus({ client, body: { online: false } });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    assert.deepEqual(calls[0], { p_online: false, p_radius_km: null });
    assert.equal(res.body.status.is_online, false);
  });

  it("accepts a single-object RPC payload (not wrapped in an array)", async () => {
    const client = makeClient({ data: ONLINE_ROW });
    const res = await handleOnlineStatus({ client, body: { online: true } });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    assert.equal(res.body.status.online_radius_km, 5);
  });

  it("400 on an invalid body", async () => {
    const client = makeClient({ data: [ONLINE_ROW] });
    const res = await handleOnlineStatus({
      client,
      body: { online: "nope" },
    });
    assert.equal(res.status, 400);
  });

  it("500 when the RPC errors", async () => {
    const client = makeClient({ error: { message: "boom" } });
    const res = await handleOnlineStatus({ client, body: { online: true } });
    assert.equal(res.status, 500);
    if (res.status === 500) assert.equal(res.body.error, "boom");
  });

  it("500 when the RPC returns no row (no caregiver profile)", async () => {
    const client = makeClient({ data: [] });
    const res = await handleOnlineStatus({ client, body: { online: true } });
    assert.equal(res.status, 500);
    if (res.status === 500) assert.equal(res.body.error, "no_caregiver_profile");
  });
});
