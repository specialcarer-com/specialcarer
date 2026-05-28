/**
 * P1-B10: report-handler unit tests.
 *
 * Auth + participation checks live in the route file; this suite
 * focuses on body validation, the reason allow-list, and that a
 * successful insert returns 201 with the new flag id.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleReportMessage,
  type ReportClient,
} from "./report-handler";

type Captured = {
  inserts: Parameters<ReportClient["insertFlag"]>[0][];
  stamps: string[];
};

function makeClient(opts: {
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
  captured?: Captured;
}): ReportClient {
  const cap = opts.captured ?? { inserts: [], stamps: [] };
  return {
    async insertFlag(input) {
      cap.inserts.push(input);
      return opts.insertResult ?? { data: { id: "flag-1" }, error: null };
    },
    async stampFlaggedAt(id) {
      cap.stamps.push(id);
    },
  };
}

describe("handleReportMessage", () => {
  it("happy path: returns 201 + new flag id and writes the row", async () => {
    const captured: Captured = { inserts: [], stamps: [] };
    const res = await handleReportMessage({
      message_id: "m1",
      thread_id: "t1",
      user_id: "u1",
      body: { reason: "harassment", notes: "rude language" },
      client: makeClient({ captured }),
    });
    assert.equal(res.status, 201);
    const json = (await res.json()) as { id: string };
    assert.equal(json.id, "flag-1");
    assert.equal(captured.inserts.length, 1);
    assert.deepEqual(captured.inserts[0], {
      message_id: "m1",
      thread_id: "t1",
      flagged_by: "u1",
      reason: "harassment",
      admin_notes: "rude language",
    });
    assert.deepEqual(captured.stamps, ["m1"]);
  });

  it("accepts each allow-listed reason", async () => {
    for (const reason of ["harassment", "spam", "safeguarding", "other"]) {
      const res = await handleReportMessage({
        message_id: "m1",
        thread_id: "t1",
        user_id: "u1",
        body: { reason },
        client: makeClient({}),
      });
      assert.equal(res.status, 201, `reason=${reason}`);
    }
  });

  it("rejects an unknown reason with 400", async () => {
    const res = await handleReportMessage({
      message_id: "m1",
      thread_id: "t1",
      user_id: "u1",
      body: { reason: "off_platform_contact" }, // reserved for auto only
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("rejects a missing reason with 400", async () => {
    const res = await handleReportMessage({
      message_id: "m1",
      thread_id: "t1",
      user_id: "u1",
      body: {},
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("rejects a non-object body with 400", async () => {
    const res = await handleReportMessage({
      message_id: "m1",
      thread_id: "t1",
      user_id: "u1",
      body: "harassment",
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("rejects non-string notes with 400", async () => {
    const res = await handleReportMessage({
      message_id: "m1",
      thread_id: "t1",
      user_id: "u1",
      body: { reason: "harassment", notes: 42 },
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("normalises empty-string notes to NULL on the insert", async () => {
    const captured: Captured = { inserts: [], stamps: [] };
    await handleReportMessage({
      message_id: "m1",
      thread_id: "t1",
      user_id: "u1",
      body: { reason: "spam", notes: "   " },
      client: makeClient({ captured }),
    });
    assert.equal(captured.inserts[0]!.admin_notes, null);
  });

  it("propagates a 500 when the DB insert errors", async () => {
    const res = await handleReportMessage({
      message_id: "m1",
      thread_id: "t1",
      user_id: "u1",
      body: { reason: "harassment" },
      client: makeClient({
        insertResult: { data: null, error: { message: "boom" } },
      }),
    });
    assert.equal(res.status, 500);
  });
});
