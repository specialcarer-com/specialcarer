/**
 * Unit tests for the pure experiment rollup aggregator (E3).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateExperimentOffers,
  type ExperimentRollupClient,
  type RollupInputRow,
  type RollupOutputRow,
} from "./rollup";

function makeClient(
  input: RollupInputRow[],
): { client: ExperimentRollupClient; captured: RollupOutputRow[] } {
  const captured: RollupOutputRow[] = [];
  return {
    captured,
    client: {
      async listOffers() {
        return { rows: input, error: null };
      },
      async upsertRow(row) {
        captured.push(row);
        return { error: null };
      },
    },
  };
}

describe("aggregateExperimentOffers", () => {
  it("groups by (experiment_id, variant) and counts statuses", async () => {
    const { client, captured } = makeClient([
      { experiment_id: "e1", variant: "control", status: "accepted" },
      { experiment_id: "e1", variant: "control", status: "declined" },
      { experiment_id: "e1", variant: "control", status: "expired" },
      { experiment_id: "e1", variant: "control", status: "pending" },
      { experiment_id: "e1", variant: "treatment", status: "accepted" },
      { experiment_id: "e1", variant: "treatment", status: "accepted" },
    ]);
    const res = await aggregateExperimentOffers(client);
    assert.equal(res.ok, true);
    if (!res.ok) return; // narrowing for TS
    assert.equal(res.scanned, 6);
    assert.equal(res.upserted, 2);
    const control = captured.find(
      (r) => r.experiment_id === "e1" && r.variant === "control",
    );
    const treatment = captured.find(
      (r) => r.experiment_id === "e1" && r.variant === "treatment",
    );
    assert.ok(control && treatment);
    assert.equal(control!.n_offers, 4);
    assert.equal(control!.n_accepted, 1);
    assert.equal(control!.n_declined, 1);
    assert.equal(control!.n_expired, 1);
    assert.equal(treatment!.n_offers, 2);
    assert.equal(treatment!.n_accepted, 2);
  });

  it("skips rows without an experiment_id / variant", async () => {
    const { client, captured } = makeClient([
      { experiment_id: "", variant: "control", status: "accepted" },
      { experiment_id: "e1", variant: "", status: "accepted" },
      { experiment_id: "e1", variant: "treatment", status: "accepted" },
    ]);
    const res = await aggregateExperimentOffers(client);
    assert.equal(res.ok, true);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].experiment_id, "e1");
    assert.equal(captured[0].variant, "treatment");
  });

  it("skips rows whose variant is not control/treatment", async () => {
    const { client, captured } = makeClient([
      { experiment_id: "e1", variant: "shadow", status: "accepted" },
      { experiment_id: "e1", variant: "treatment", status: "accepted" },
    ]);
    const res = await aggregateExperimentOffers(client);
    assert.equal(res.ok, true);
    assert.equal(captured.length, 1);
  });

  it("propagates list errors", async () => {
    const client: ExperimentRollupClient = {
      async listOffers() {
        return { rows: [], error: "boom" };
      },
      async upsertRow() {
        return { error: null };
      },
    };
    const res = await aggregateExperimentOffers(client);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error, "boom");
  });

  it("propagates upsert errors and stops early", async () => {
    let calls = 0;
    const client: ExperimentRollupClient = {
      async listOffers() {
        return {
          rows: [
            { experiment_id: "e1", variant: "control", status: "accepted" },
            { experiment_id: "e1", variant: "treatment", status: "accepted" },
          ],
          error: null,
        };
      },
      async upsertRow() {
        calls += 1;
        return { error: "db down" };
      },
    };
    const res = await aggregateExperimentOffers(client);
    assert.equal(res.ok, false);
    // First upsert already errored; we don't attempt the second.
    assert.equal(calls, 1);
  });

  it("empty input yields ok:true, scanned:0, upserted:0", async () => {
    const { client } = makeClient([]);
    const res = await aggregateExperimentOffers(client);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.scanned, 0);
    assert.equal(res.upserted, 0);
  });
});
