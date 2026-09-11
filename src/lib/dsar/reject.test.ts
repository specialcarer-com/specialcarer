import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleDsarReject,
  type DsarRejectClient,
  type DsarRejectRow,
} from "./reject";
import { renderDsarRejectedEmail } from "./emails";

// A tiny in-memory fake keyed by id. `fetchState` overrides what fetchById
// returns after the initial insert; `markRejectedError` lets us simulate DB
// errors or "no row updated" (concurrent update).
function makeClient(opts: {
  row: DsarRejectRow | null;
  fetchError?: { code?: string; message?: string };
  markUpdated?: DsarRejectRow | null;
  markError?: { code?: string; message?: string };
  captureUpdate?: (input: {
    id: string;
    reason: string;
    admin_email: string;
    previous_state: string;
  }) => void;
}): DsarRejectClient {
  return {
    async fetchById(_id) {
      return { data: opts.row, error: opts.fetchError ?? null };
    },
    async markRejected(input) {
      opts.captureUpdate?.(input);
      return {
        data: opts.markUpdated ?? null,
        error: opts.markError ?? null,
      };
    },
  };
}

const BASE_ROW: DsarRejectRow = {
  id: "req-1",
  subject_email: "alice@example.com",
  request_type: "access",
  state: "in_progress",
  notes: null,
};

describe("handleDsarReject", () => {
  it("rejects reasons shorter than 10 chars as invalid_reason", async () => {
    const client = makeClient({ row: BASE_ROW });
    const result = await handleDsarReject({
      input: { request_id: "req-1", reason: "short", admin_email: "a@x" },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.code, "invalid_reason");
    }
  });

  it("trims reasons before length check", async () => {
    const client = makeClient({ row: BASE_ROW });
    const result = await handleDsarReject({
      // 20 spaces plus 6 chars = 26 raw but trims to 6 = invalid
      input: {
        request_id: "req-1",
        reason: "                    reject",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid_reason");
  });

  it("rejects reasons over 2000 chars", async () => {
    const client = makeClient({ row: BASE_ROW });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "x".repeat(2001),
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid_reason");
  });

  it("returns 404 not_found when the row does not exist", async () => {
    const client = makeClient({ row: null });
    const result = await handleDsarReject({
      input: {
        request_id: "missing",
        reason: "Subject is not the account holder.",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.code, "not_found");
    }
  });

  it("degrades to schema_not_ready on 42P01 fetch error", async () => {
    const client = makeClient({
      row: null,
      fetchError: { code: "42P01", message: 'relation "dsar_requests" does not exist' },
    });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "Reasonable reason here.",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "schema_not_ready");
  });

  it("refuses to reject a row that is already delivered", async () => {
    const client = makeClient({
      row: { ...BASE_ROW, state: "delivered" },
    });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "Reasonable reason here.",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.code, "already_terminal");
    }
  });

  it("refuses to reject a row that is already rejected", async () => {
    const client = makeClient({
      row: { ...BASE_ROW, state: "rejected" },
    });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "Reasonable reason here.",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "already_terminal");
  });

  it("refuses to reject a row that is already cancelled", async () => {
    const client = makeClient({
      row: { ...BASE_ROW, state: "cancelled" },
    });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "Reasonable reason here.",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "already_terminal");
  });

  it("reports concurrent_update when the state guard returns no row", async () => {
    // Read said state=in_progress but the guarded UPDATE returned no row
    // (someone flipped it to delivered between our read and our write).
    const client = makeClient({
      row: BASE_ROW,
      markUpdated: null,
    });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "Reasonable reason here.",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.code, "concurrent_update");
    }
  });

  it("succeeds from submitted state and returns previous_state", async () => {
    const captured: { previous_state?: string; reason?: string } = {};
    const client = makeClient({
      row: { ...BASE_ROW, state: "submitted" },
      markUpdated: { ...BASE_ROW, state: "rejected", notes: "…" },
      captureUpdate: (i) => {
        captured.previous_state = i.previous_state;
        captured.reason = i.reason;
      },
    });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "  Subject is not the account holder.  ",
        admin_email: "admin@specialcarer.com",
      },
      client,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.previous_state, "submitted");
      assert.equal(result.row.state, "rejected");
    }
    // Reason passed through trimmed.
    assert.equal(captured.reason, "Subject is not the account holder.");
    assert.equal(captured.previous_state, "submitted");
  });

  it("succeeds from verifying state", async () => {
    const client = makeClient({
      row: { ...BASE_ROW, state: "verifying" },
      markUpdated: { ...BASE_ROW, state: "rejected" },
    });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "Third-party rights engaged.",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.previous_state, "verifying");
  });

  it("surfaces DB errors as db_error 500", async () => {
    const client = makeClient({
      row: BASE_ROW,
      markError: { code: "XX000", message: "internal_error" },
    });
    const result = await handleDsarReject({
      input: {
        request_id: "req-1",
        reason: "Reasonable reason here.",
        admin_email: "a@x",
      },
      client,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 500);
      assert.equal(result.code, "db_error");
    }
  });
});

describe("renderDsarRejectedEmail", () => {
  it("includes the reason and ICO signposting in html and text", () => {
    const out = renderDsarRejectedEmail({
      subject_email: "alice@example.com",
      request_type: "access",
      reason: "We could not verify you are the account holder.",
    });
    assert.match(out.subject, /access/);
    assert.match(out.html, /alice@example\.com/);
    assert.match(out.html, /account holder/);
    assert.match(out.html, /ico\.org\.uk/);
    assert.match(out.text, /alice@example\.com/);
    assert.match(out.text, /account holder/);
    assert.match(out.text, /ico\.org\.uk/);
  });

  it("escapes HTML in the reason", () => {
    const out = renderDsarRejectedEmail({
      subject_email: "bob@example.com",
      request_type: "erasure",
      reason: "<script>alert(1)</script>",
    });
    // Verify raw <script> did not survive into the html output.
    assert.equal(out.html.includes("<script>"), false);
    // And the escaped form is present.
    assert.match(out.html, /&lt;script&gt;/);
    // Plain text keeps the raw content (no execution context in text/plain).
    assert.match(out.text, /<script>alert\(1\)<\/script>/);
  });

  it("supports a custom support email", () => {
    const out = renderDsarRejectedEmail({
      subject_email: "c@example.com",
      request_type: "portability",
      reason: "We do not hold personal data for this address.",
      support_email: "dpo@specialcarer.com",
    });
    assert.match(out.html, /dpo@specialcarer\.com/);
    assert.match(out.text, /dpo@specialcarer\.com/);
  });

  it("labels unknown request types by pass-through", () => {
    const out = renderDsarRejectedEmail({
      subject_email: "d@example.com",
      request_type: "future-type-xyz",
      reason: "We do not process this type of request today.",
    });
    assert.match(out.html, /future-type-xyz/);
  });
});
