import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ERASE_CONFIRMATION,
  NOTES_MAX,
  areNotesValid,
  canSubmitErase,
  checkErasePreconditions,
  isConfirmationValid,
  reduceEraseResponse,
  type ErasePreconditionInput,
} from "./erase-confirmation";

// --------------------------------------------------------------------------
// checkErasePreconditions — mirrors the route guard clauses
// --------------------------------------------------------------------------

function preconditionRow(
  overrides: Partial<ErasePreconditionInput> = {},
): ErasePreconditionInput {
  return {
    request_type: "erasure",
    state: "in_progress",
    verified_at: "2026-09-10T10:00:00Z",
    subject_user_id: "user-1",
    ...overrides,
  };
}

describe("checkErasePreconditions", () => {
  it("returns 'eligible' when every guard passes", () => {
    assert.equal(checkErasePreconditions(preconditionRow()), "eligible");
  });

  it("returns 'wrong_request_type' for non-erasure requests", () => {
    for (const t of ["access", "portability", "rectification"]) {
      assert.equal(
        checkErasePreconditions(preconditionRow({ request_type: t })),
        "wrong_request_type",
      );
    }
  });

  it("returns 'wrong_state' when state is not in_progress", () => {
    for (const s of [
      "submitted",
      "verifying",
      "delivered",
      "erased",
      "rejected",
      "cancelled",
    ]) {
      assert.equal(
        checkErasePreconditions(preconditionRow({ state: s })),
        "wrong_state",
      );
    }
  });

  it("returns 'not_verified' when verified_at is null", () => {
    assert.equal(
      checkErasePreconditions(preconditionRow({ verified_at: null })),
      "not_verified",
    );
  });

  it("returns 'no_account' when subject_user_id is null but everything else is set", () => {
    assert.equal(
      checkErasePreconditions(preconditionRow({ subject_user_id: null })),
      "no_account",
    );
  });

  it("prefers stronger failures over 'no_account'", () => {
    // wrong_request_type outranks no_account
    assert.equal(
      checkErasePreconditions(
        preconditionRow({ subject_user_id: null, request_type: "access" }),
      ),
      "wrong_request_type",
    );
    // wrong_state outranks no_account
    assert.equal(
      checkErasePreconditions(
        preconditionRow({ subject_user_id: null, state: "delivered" }),
      ),
      "wrong_state",
    );
    // not_verified outranks no_account
    assert.equal(
      checkErasePreconditions(
        preconditionRow({ subject_user_id: null, verified_at: null }),
      ),
      "not_verified",
    );
  });
});

// --------------------------------------------------------------------------
// isConfirmationValid
// --------------------------------------------------------------------------

describe("isConfirmationValid", () => {
  it("accepts the exact literal", () => {
    assert.equal(isConfirmationValid(ERASE_CONFIRMATION), true);
  });
  it("trims surrounding whitespace", () => {
    assert.equal(isConfirmationValid("  ERASE  "), true);
    assert.equal(isConfirmationValid("\tERASE\n"), true);
  });
  it("rejects wrong case", () => {
    assert.equal(isConfirmationValid("erase"), false);
    assert.equal(isConfirmationValid("Erase"), false);
  });
  it("rejects partial or extra text", () => {
    assert.equal(isConfirmationValid("ERAS"), false);
    assert.equal(isConfirmationValid("ERASE!"), false);
    assert.equal(isConfirmationValid("ERASE ME"), false);
  });
  it("rejects empty string", () => {
    assert.equal(isConfirmationValid(""), false);
    assert.equal(isConfirmationValid("   "), false);
  });
});

// --------------------------------------------------------------------------
// areNotesValid
// --------------------------------------------------------------------------

describe("areNotesValid", () => {
  it("allows empty notes", () => {
    assert.equal(areNotesValid(""), true);
    assert.equal(areNotesValid("   "), true);
  });
  it("allows notes up to NOTES_MAX", () => {
    assert.equal(areNotesValid("a".repeat(NOTES_MAX)), true);
  });
  it("rejects notes longer than NOTES_MAX after trimming", () => {
    assert.equal(areNotesValid("a".repeat(NOTES_MAX + 1)), false);
  });
});

// --------------------------------------------------------------------------
// canSubmitErase — combined predicate
// --------------------------------------------------------------------------

describe("canSubmitErase", () => {
  it("allows submit with valid confirmation and no notes", () => {
    assert.equal(
      canSubmitErase({
        typed_confirmation: ERASE_CONFIRMATION,
        notes: "",
        busy: false,
      }),
      true,
    );
  });
  it("blocks when busy", () => {
    assert.equal(
      canSubmitErase({
        typed_confirmation: ERASE_CONFIRMATION,
        notes: "",
        busy: true,
      }),
      false,
    );
  });
  it("blocks when confirmation is wrong", () => {
    assert.equal(
      canSubmitErase({
        typed_confirmation: "delete",
        notes: "",
        busy: false,
      }),
      false,
    );
  });
  it("blocks when notes are too long", () => {
    assert.equal(
      canSubmitErase({
        typed_confirmation: ERASE_CONFIRMATION,
        notes: "a".repeat(NOTES_MAX + 1),
        busy: false,
      }),
      false,
    );
  });
});

// --------------------------------------------------------------------------
// reduceEraseResponse
// --------------------------------------------------------------------------

describe("reduceEraseResponse", () => {
  const cleanBody = {
    ok: true,
    request_id: "req-1",
    state: "erased" as const,
    nulled_count: 12,
    retained_count: 4,
    deferred_count: 3,
    email_sent: true,
    email_error: null,
    audit_persist_error: null,
    deferred_persist_error: null,
    request_persist_error: null,
    digest: "sha256:abc",
  };

  it("returns 'ok' for a clean success", () => {
    const r = reduceEraseResponse(200, cleanBody);
    assert.equal(r.kind, "ok");
    if (r.kind === "ok") {
      assert.match(r.summary, /Nulled 12/);
      assert.match(r.summary, /retained 4/);
      assert.match(r.summary, /deferred 3/);
    }
  });

  it("returns 'partial' when the completion email did not send", () => {
    const r = reduceEraseResponse(200, {
      ...cleanBody,
      email_sent: false,
      email_error: "SMTP 550",
    });
    assert.equal(r.kind, "partial");
    if (r.kind === "partial") {
      assert.equal(r.warnings.length, 1);
      assert.match(r.warnings[0], /email did not send/i);
      assert.match(r.warnings[0], /SMTP 550/);
    }
  });

  it("returns 'partial' with multiple warnings when persist errors are present", () => {
    const r = reduceEraseResponse(200, {
      ...cleanBody,
      email_sent: false,
      email_error: "SMTP 550",
      audit_persist_error: "insert failed",
      deferred_persist_error: "constraint x",
      request_persist_error: "update rejected",
    });
    assert.equal(r.kind, "partial");
    if (r.kind === "partial") {
      assert.equal(r.warnings.length, 4);
    }
  });

  it("returns 'error' for HTTP failure with a body error", () => {
    const r = reduceEraseResponse(409, {
      ok: false,
      error: "not_ready",
      message: "Request is submitted, not in_progress.",
    });
    assert.equal(r.kind, "error");
    if (r.kind === "error") {
      assert.match(r.message, /not in_progress/);
    }
  });

  it("returns 'error' when body is not an object", () => {
    const r = reduceEraseResponse(500, null);
    assert.equal(r.kind, "error");
  });

  it("returns 'error' when ok is missing on a 200", () => {
    const r = reduceEraseResponse(200, { state: "erased" });
    assert.equal(r.kind, "error");
  });
});
