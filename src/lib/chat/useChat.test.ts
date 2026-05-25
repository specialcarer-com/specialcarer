/**
 * Pure-logic tests for the chat hook scaffolding.
 *
 * The hook itself depends on React's hooks runtime; here we cover the
 * deterministic, side-effect-free helpers it exports so we can verify
 * the invariants (de-dup on id, status mapping) without a renderer.
 *
 * State-machine integration is exercised by the route + server tests
 * elsewhere — A4-bis-2 deliberately keeps useChat thin.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendIfNew, statusForFetchThreadError } from "./useChat";
import type { ChatMessage } from "./client";

function msg(id: string, body = "hi", t = "2026-05-25T00:00:00.000Z"): ChatMessage {
  return {
    id,
    thread_id: "t",
    sender_id: "u",
    body,
    created_at: t,
  };
}

describe("appendIfNew (message de-dup)", () => {
  it("appends a fresh id to the end of the list", () => {
    const before = [msg("a"), msg("b")];
    const after = appendIfNew(before, msg("c"));
    assert.deepEqual(
      after.map((m) => m.id),
      ["a", "b", "c"],
    );
  });

  it("returns the previous list unchanged when the id is already present", () => {
    const before = [msg("a"), msg("b")];
    const after = appendIfNew(before, msg("b", "duplicate"));
    assert.strictEqual(after, before);
  });

  it("preserves order — does not reorder existing messages", () => {
    const before = [msg("a"), msg("b"), msg("c")];
    const after = appendIfNew(before, msg("d"));
    assert.deepEqual(
      after.map((m) => m.id),
      ["a", "b", "c", "d"],
    );
  });
});

describe("statusForFetchThreadError (status mapping)", () => {
  it("maps no_carer_yet to the no_carer_yet status", () => {
    assert.equal(statusForFetchThreadError("no_carer_yet"), "no_carer_yet");
  });

  it("maps unauthorized to the error status", () => {
    assert.equal(statusForFetchThreadError("unauthorized"), "error");
  });

  it("maps unknown to the error status", () => {
    assert.equal(statusForFetchThreadError("unknown"), "error");
  });
});
