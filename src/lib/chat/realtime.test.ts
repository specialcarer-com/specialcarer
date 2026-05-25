import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatRealtimeConfig } from "./realtime";

describe("chatRealtimeConfig", () => {
  it("returns the per-thread channel topic + postgres_changes filter", () => {
    const c = chatRealtimeConfig("abc-123");
    assert.equal(c.channelTopic, "chat:thread:abc-123");
    assert.equal(c.table, "chat_messages");
    assert.equal(c.filter, "thread_id=eq.abc-123");
  });

  it("encodes a uuid threadId verbatim", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const c = chatRealtimeConfig(id);
    assert.equal(c.channelTopic, `chat:thread:${id}`);
    assert.equal(c.filter, `thread_id=eq.${id}`);
  });
});
