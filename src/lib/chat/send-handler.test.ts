/**
 * Unit tests for the send-route body validator. Uses node:test (see
 * the `test` script in package.json) — no zod, no extra deps.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateSendBody, type SendBody } from "./send-handler";

describe("validateSendBody", () => {
  it("accepts a body-only payload and trims whitespace", () => {
    const v = validateSendBody({ body: "  hi there  " });
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.input.body, "hi there");
      assert.equal(v.input.attachment_path, null);
      assert.equal(v.input.attachment_kind, null);
    }
  });

  it("rejects when both body and attachment are empty", () => {
    const v = validateSendBody({ body: "   " });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.status, 400);
  });

  it("rejects when body is the wrong type", () => {
    const v = validateSendBody({ body: 42 as unknown as SendBody["body"] });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.status, 400);
  });

  it("rejects attachment without a kind", () => {
    const v = validateSendBody({ attachment_path: "uploads/x.jpg" });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.status, 400);
  });

  it("rejects bogus attachment_kind", () => {
    const v = validateSendBody({
      attachment_path: "uploads/x.bin",
      attachment_kind: "pdf",
    });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.status, 400);
  });

  it("accepts a valid attachment", () => {
    const v = validateSendBody({
      attachment_path: "uploads/x.jpg",
      attachment_kind: "image",
    });
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.input.attachment_path, "uploads/x.jpg");
      assert.equal(v.input.attachment_kind, "image");
      assert.equal(v.input.body, null);
    }
  });

  it("preserves body when both body and attachment are present", () => {
    const v = validateSendBody({
      body: "look at this",
      attachment_path: "uploads/y.mp4",
      attachment_kind: "video",
    });
    assert.equal(v.ok, true);
    if (v.ok) {
      assert.equal(v.input.body, "look at this");
      assert.equal(v.input.attachment_kind, "video");
    }
  });
});
