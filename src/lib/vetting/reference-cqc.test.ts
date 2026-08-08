import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateReferenceGate,
  isReferenceType,
  validateEmploymentDates,
  validateReferenceVerifyGuard,
} from "./reference-cqc";

describe("CQC Schedule 3 reference gate", () => {
  it("does not complete with three verified non-employer references", () => {
    const result = calculateReferenceGate([
      { status: "verified", reference_type: "character" },
      { status: "verified", reference_type: "professional" },
      { status: "verified", reference_type: "client" },
    ]);

    assert.deepEqual(result, {
      verified: 3,
      total: 3,
      verified_employer: 0,
      complete: false,
    });
  });

  it("completes with two verified references including one employer", () => {
    const result = calculateReferenceGate([
      { status: "verified", reference_type: "employer" },
      { status: "verified", reference_type: "professional" },
      { status: "submitted", reference_type: "character" },
    ]);

    assert.deepEqual(result, {
      verified: 2,
      total: 3,
      verified_employer: 1,
      complete: true,
    });
  });

  it("treats null reference types as employer for backward compatibility", () => {
    const result = calculateReferenceGate([
      { status: "verified", reference_type: null },
      { status: "verified", reference_type: null },
    ]);

    assert.deepEqual(result, {
      verified: 2,
      total: 2,
      verified_employer: 2,
      complete: true,
    });
  });
});

describe("reference field validation", () => {
  it("rejects an invalid reference type at creation", () => {
    assert.equal(isReferenceType("neighbour"), false);
    assert.equal(isReferenceType("employer"), true);
  });

  it("rejects an employment end date before its start date", () => {
    assert.equal(
      validateEmploymentDates({
        employmentStart: "2025-04-01",
        employmentEnd: "2025-03-31",
        stillEmployed: false,
        today: "2026-08-08",
      }),
      "Employment end date cannot be before the start date",
    );
  });

  it("rejects an employment start date in the future", () => {
    assert.equal(
      validateEmploymentDates({
        employmentStart: "2026-09-01",
        employmentEnd: null,
        stillEmployed: false,
        today: "2026-08-08",
      }),
      "Employment start date cannot be in the future",
    );
  });

  it("rejects an end date when the referee says the candidate is still employed", () => {
    assert.equal(
      validateEmploymentDates({
        employmentStart: "2025-04-01",
        employmentEnd: "2026-04-01",
        stillEmployed: true,
        today: "2026-08-08",
      }),
      "Employment end date must be empty when still employed",
    );
  });

  it("blocks verification until safeguarding is answered", () => {
    assert.equal(
      validateReferenceVerifyGuard({ safeguardingDbs: null, adminNotes: "" }),
      "safeguarding_dbs_required",
    );
  });

  it("requires admin notes to verify a safeguarding yes declaration", () => {
    assert.equal(
      validateReferenceVerifyGuard({ safeguardingDbs: "yes", adminNotes: " " }),
      "admin_notes_required_for_safeguarding_yes",
    );
    assert.equal(
      validateReferenceVerifyGuard({
        safeguardingDbs: "yes",
        adminNotes: "Reviewed with HR; declaration is historic and resolved.",
      }),
      null,
    );
  });
});
