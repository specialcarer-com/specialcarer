/**
 * Tests for the KPI rollup derivation (B2 — synthetic fallback removed).
 *
 * Behaviour under test:
 *   - bookings + gmv derive from the injected bookings rows
 *   - the four unwired metrics (nps, repeat_rate, fill_rate,
 *     time_to_match_min) return state='error' + errorCode='no_derivation_wired',
 *     NEVER a fabricated numeric value
 *   - DB read failures propagate as state='error' with a short error code,
 *     not silently swallowed and hidden behind a mock value
 *   - GMV filters on paidish statuses and treats non-numeric total_cents
 *     as zero
 *   - a null rows response (e.g. permission denied returning empty data)
 *     is treated as an error, not as "zero bookings"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveKpisForDay,
  type BookingRow,
  type DeriveClient,
} from "./derive";
import { KPI_METRICS, type KpiMetric } from "@/lib/admin-ops/types";

function clientWith(
  rows: BookingRow[] | null,
  error?: string | null,
): DeriveClient {
  return {
    async fetchBookingsForDay() {
      return { rows, error: error ?? null };
    },
  };
}

function byMetric(
  arr: Awaited<ReturnType<typeof deriveKpisForDay>>,
): Record<KpiMetric, (typeof arr)[number]> {
  const out = {} as Record<KpiMetric, (typeof arr)[number]>;
  for (const k of arr) out[k.metric] = k;
  return out;
}

describe("deriveKpisForDay — output shape", () => {
  it("always returns exactly one entry per KPI_METRICS in fixed order", async () => {
    const out = await deriveKpisForDay("2026-09-11", clientWith([]));
    assert.equal(out.length, KPI_METRICS.length);
    assert.deepEqual(
      out.map((k) => k.metric),
      [...KPI_METRICS],
    );
  });
});

describe("deriveKpisForDay — bookings/gmv from real rows", () => {
  it("counts bookings and sums paidish GMV in pounds", async () => {
    const rows: BookingRow[] = [
      { status: "paid", total_cents: 1000 },
      { status: "in_progress", total_cents: 2500 },
      { status: "completed", total_cents: 4500 },
      { status: "paid_out", total_cents: 2000 },
      { status: "cancelled", total_cents: 5000 }, // excluded
      { status: "requested", total_cents: 3000 }, // excluded
    ];
    const map = byMetric(
      await deriveKpisForDay("2026-09-11", clientWith(rows)),
    );

    assert.deepEqual(map.bookings, {
      metric: "bookings",
      state: "ok",
      value: 6,
    });
    // 10 + 25 + 45 + 20 pence-hundreds = 10000 pence = £100.00
    assert.deepEqual(map.gmv, { metric: "gmv", state: "ok", value: 100 });
  });

  it("treats non-numeric total_cents as zero and unknown status as excluded", async () => {
    const rows: BookingRow[] = [
      { status: "paid", total_cents: 500 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { status: "paid", total_cents: "oops" as any },
      { status: undefined, total_cents: 999 },
    ];
    const map = byMetric(
      await deriveKpisForDay("2026-09-11", clientWith(rows)),
    );
    assert.equal(map.bookings.value, 3);
    // Only the first row contributes: 500 pence = £5.00.
    assert.deepEqual(map.gmv, { metric: "gmv", state: "ok", value: 5 });
  });

  it("returns bookings.value = 0 when the read succeeds with no rows", async () => {
    const map = byMetric(
      await deriveKpisForDay("2026-09-11", clientWith([])),
    );
    assert.deepEqual(map.bookings, {
      metric: "bookings",
      state: "ok",
      value: 0,
    });
    assert.deepEqual(map.gmv, { metric: "gmv", state: "ok", value: 0 });
  });
});

describe("deriveKpisForDay — errors are visible, not fabricated", () => {
  it("returns state='error' with schema_not_ready when the read errors on a missing table", async () => {
    const map = byMetric(
      await deriveKpisForDay(
        "2026-09-11",
        clientWith(null, 'relation "public.bookings" does not exist'),
      ),
    );
    assert.equal(map.bookings.state, "error");
    assert.equal(map.bookings.value, null);
    assert.equal(map.bookings.errorCode, "schema_not_ready");
    assert.equal(map.gmv.state, "error");
    assert.equal(map.gmv.value, null);
    assert.equal(map.gmv.errorCode, "schema_not_ready");
  });

  it("maps permission-denied and timeout to short error codes", async () => {
    const denied = byMetric(
      await deriveKpisForDay(
        "2026-09-11",
        clientWith(null, "permission denied for table bookings"),
      ),
    );
    assert.equal(denied.bookings.errorCode, "permission_denied");

    const timeout = byMetric(
      await deriveKpisForDay(
        "2026-09-11",
        clientWith(null, "canceling statement due to statement timeout"),
      ),
    );
    assert.equal(timeout.bookings.errorCode, "timeout");
  });

  it("falls back to db_error for anything else", async () => {
    const other = byMetric(
      await deriveKpisForDay(
        "2026-09-11",
        clientWith(null, "connection reset by peer"),
      ),
    );
    assert.equal(other.bookings.errorCode, "db_error");
  });

  it("treats a null rows response with no explicit error as an error, not zero bookings", async () => {
    const map = byMetric(
      await deriveKpisForDay("2026-09-11", clientWith(null)),
    );
    assert.equal(map.bookings.state, "error");
    assert.equal(map.bookings.value, null);
    assert.equal(map.bookings.errorCode, "bookings_read_returned_null");
  });

  it("captures thrown fetch errors as state='error' with fetch_threw / db_error", async () => {
    const throwing: DeriveClient = {
      async fetchBookingsForDay() {
        throw new Error("network offline");
      },
    };
    const map = byMetric(await deriveKpisForDay("2026-09-11", throwing));
    assert.equal(map.bookings.state, "error");
    assert.equal(map.gmv.state, "error");
  });
});

describe("deriveKpisForDay — unwired metrics are honest, not mocked", () => {
  it("never produces a numeric value for nps / repeat_rate / fill_rate / time_to_match_min", async () => {
    const out = await deriveKpisForDay(
      "2026-09-11",
      clientWith([{ status: "paid", total_cents: 100 }]),
    );
    const unwiredMetrics: KpiMetric[] = [
      "nps",
      "repeat_rate",
      "fill_rate",
      "time_to_match_min",
    ];
    for (const m of unwiredMetrics) {
      const row = out.find((k) => k.metric === m);
      assert.ok(row, `missing metric row for ${m}`);
      assert.equal(row.state, "error");
      assert.equal(row.value, null);
      assert.equal(row.errorCode, "no_derivation_wired");
    }
  });
});

describe("regression guards — mock fallback is really gone", () => {
  it("does not import a mock generator from route.ts", async () => {
    // If someone reintroduces a `mockFor` helper we want CI red before
    // the dashboard silently starts lying again. Read the sibling file
    // and assert against its source text — cheap and durable.
    //
    // Strip comments before scanning so the docblock explaining what
    // was removed doesn't trip the guard.
    const { readFileSync } = await import("node:fs");
    const path = new URL("./route.ts", import.meta.url);
    const raw = readFileSync(path, "utf8");
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Look for identifiers a regression would actually reintroduce.
    assert.equal(
      /\bmockFor\b|\bfabricate\b/.test(code),
      false,
      "route.ts must not reintroduce a synthetic fallback helper",
    );
  });

  it("derive.ts does not fabricate values in unwired branches", async () => {
    const { readFileSync } = await import("node:fs");
    const path = new URL("./derive.ts", import.meta.url);
    const src = readFileSync(path, "utf8");
    // The `unwired` branch must return null. Grep is enough — any numeric
    // literal appearing in the unwired helper is a regression signal.
    const unwiredMatch = src.match(
      /function unwired[\s\S]+?return \{[\s\S]+?\};[\s\S]*?\}/,
    );
    assert.ok(unwiredMatch, "unwired() helper not found in derive.ts");
    const body = unwiredMatch[0];
    assert.equal(
      /value:\s*[0-9]/.test(body),
      false,
      "unwired() must not return a numeric value",
    );
  });
});
