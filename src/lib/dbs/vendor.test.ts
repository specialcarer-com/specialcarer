/**
 * Unit tests for the DBS application vendor adapter (PR-DBS-1).
 * Runs under tsx via the `test` npm script.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { MockDbsVendor, UCheckVendor } from "./vendor";

const carerDetails = {
  legalName: "Alex Carer",
  dateOfBirth: "1990-04-12",
  surname: "Carer",
};

describe("MockDbsVendor", () => {
  let vendor: MockDbsVendor;
  beforeEach(() => {
    vendor = new MockDbsVendor();
  });

  it("mints a fresh reference per application and starts 'submitted'", async () => {
    const a = await vendor.submitApplication({
      carerId: "11111111-2222-3333-4444-555555555555",
      kind: "adult",
      carerDetails,
    });
    const b = await vendor.submitApplication({
      carerId: "11111111-2222-3333-4444-555555555555",
      kind: "child",
      carerDetails,
    });
    assert.notEqual(a.vendorReference, b.vendorReference);
    const status = await vendor.getStatus(a.vendorReference);
    assert.equal(status.status, "submitted");
  });

  it("walks a scripted transition queue one step per getStatus call", async () => {
    const { vendorReference } = await vendor.submitApplication({
      carerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      kind: "adult",
      carerDetails,
    });
    vendor.configure(vendorReference, {
      transitions: ["in_progress", "approved"],
    });
    assert.equal((await vendor.getStatus(vendorReference)).status, "in_progress");
    const approved = await vendor.getStatus(vendorReference);
    assert.equal(approved.status, "approved");
    assert.ok(approved.decisionAt instanceof Date);
    assert.ok(
      approved.certificateNumber && approved.certificateNumber.length > 0,
    );
  });

  it("sticks on the final status after the queue is exhausted", async () => {
    const { vendorReference } = await vendor.submitApplication({
      carerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      kind: "child",
      carerDetails,
    });
    vendor.configure(vendorReference, { transitions: ["rejected"] });
    assert.equal((await vendor.getStatus(vendorReference)).status, "rejected");
    // Repeated calls stay rejected.
    assert.equal((await vendor.getStatus(vendorReference)).status, "rejected");
  });

  it("throws on an unknown reference", async () => {
    await assert.rejects(() => vendor.getStatus("nope"), /unknown vendorReference/);
  });

  it("reset() clears all state", async () => {
    const { vendorReference } = await vendor.submitApplication({
      carerId: "x",
      kind: "adult",
      carerDetails,
    });
    vendor.reset();
    await assert.rejects(() => vendor.getStatus(vendorReference));
  });
});

describe("UCheckVendor (stub)", () => {
  it("throws the PR-DBS-2 message until UCHECK_API_KEY is set", async () => {
    const original = process.env.UCHECK_API_KEY;
    delete process.env.UCHECK_API_KEY;
    const vendor = new UCheckVendor();
    await assert.rejects(
      () =>
        vendor.submitApplication({
          carerId: "x",
          kind: "adult",
          carerDetails,
        }),
      /PR-DBS-2/,
    );
    await assert.rejects(() => vendor.getStatus("ref"), /PR-DBS-2/);
    if (original !== undefined) process.env.UCHECK_API_KEY = original;
  });
});
