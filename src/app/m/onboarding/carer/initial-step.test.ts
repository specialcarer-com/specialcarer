import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { pickInitialStep } from "./initial-step";
import type { ProfileReadiness } from "@/lib/care/profile";

function readiness(over: Partial<ProfileReadiness> = {}): ProfileReadiness {
  return {
    hasProfile: false,
    hasName: false,
    hasBio: false,
    hasRate: false,
    hasService: false,
    hasFormat: false,
    hasLocation: false,
    payoutsEnabled: false,
    bgChecksCleared: false,
    missingChecks: [],
    isPublishable: false,
    isPublished: false,
    ...over,
  };
}

describe("pickInitialStep", () => {
  it("returns 1 for a brand-new carer with no data", () => {
    assert.equal(pickInitialStep({ display_name: "" }, readiness()), 1);
  });

  it("returns 1 when display_name is whitespace-only (treated as empty)", () => {
    assert.equal(
      pickInitialStep({ display_name: "   " }, readiness({ hasBio: true })),
      1,
    );
  });

  it("returns 1 when a name exists but bio doesn't yet", () => {
    assert.equal(
      pickInitialStep({ display_name: "Priya" }, readiness({ hasBio: false })),
      1,
    );
  });

  it("returns 2 when about-you is done but no services picked", () => {
    assert.equal(
      pickInitialStep(
        { display_name: "Priya" },
        readiness({ hasBio: true, hasService: false }),
      ),
      2,
    );
  });

  it("returns 3 when services are picked but no care format is chosen", () => {
    assert.equal(
      pickInitialStep(
        { display_name: "Priya" },
        readiness({
          hasBio: true,
          hasService: true,
          hasFormat: false,
        }),
      ),
      3,
    );
  });

  it("returns 4 when a care format is chosen but rate/location are not set", () => {
    assert.equal(
      pickInitialStep(
        { display_name: "Priya" },
        readiness({
          hasBio: true,
          hasService: true,
          hasFormat: true,
          hasRate: false,
          hasLocation: false,
        }),
      ),
      4,
    );
  });

  it("returns 4 when rate is set but location is missing", () => {
    assert.equal(
      pickInitialStep(
        { display_name: "Priya" },
        readiness({
          hasBio: true,
          hasService: true,
          hasFormat: true,
          hasRate: true,
          hasLocation: false,
        }),
      ),
      4,
    );
  });

  it("returns 5 when rate + location are set but background checks aren't cleared", () => {
    assert.equal(
      pickInitialStep(
        { display_name: "Priya" },
        readiness({
          hasBio: true,
          hasService: true,
          hasFormat: true,
          hasRate: true,
          hasLocation: true,
          bgChecksCleared: false,
        }),
      ),
      5,
    );
  });

  it("returns 6 (publish) when everything is ready", () => {
    assert.equal(
      pickInitialStep(
        { display_name: "Priya" },
        readiness({
          hasBio: true,
          hasService: true,
          hasFormat: true,
          hasRate: true,
          hasLocation: true,
          bgChecksCleared: true,
          isPublishable: true,
        }),
      ),
      6,
    );
  });
});
