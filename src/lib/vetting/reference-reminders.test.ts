import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextReferenceReminderStage,
  processReferenceReminders,
  type ReferenceReminderCandidate,
} from "./reference-reminders";

const NOW = new Date("2026-08-15T09:00:00.000Z");
const futureExpiry = "2026-08-26T09:00:00.000Z";

function reference(
  overrides: Partial<ReferenceReminderCandidate> = {},
): ReferenceReminderCandidate {
  return {
    id: "reference-1",
    carer_id: "carer-1",
    created_at: "2026-08-12T09:00:00.000Z",
    token_expires_at: futureExpiry,
    last_resend_at: null,
    reminder_stage: 0,
    ...overrides,
  };
}

async function run(rows: ReferenceReminderCandidate[]) {
  const dispatched: number[] = [];
  const marked: number[] = [];
  const result = await processReferenceReminders(rows, NOW, {
    getCarerName: async () => "Aisha Khan",
    dispatch: async ({ stage }) => {
      dispatched.push(stage);
    },
    markSent: async ({ stage }) => {
      marked.push(stage);
    },
  });
  return { result, dispatched, marked };
}

describe("reference reminder cron scheduling", () => {
  it("sends stage 1 and increments stage at Day 3", async () => {
    const { result, dispatched, marked } = await run([reference()]);
    assert.deepEqual(dispatched, [1]);
    assert.deepEqual(marked, [1]);
    assert.deepEqual(result, { scanned: 1, sent: 1, errors: [] });
  });

  it("skips a stage 1 row at Day 3", async () => {
    const { result, dispatched, marked } = await run([
      reference({ reminder_stage: 1 }),
    ]);
    assert.deepEqual(dispatched, []);
    assert.deepEqual(marked, []);
    assert.deepEqual(result, { scanned: 1, sent: 0, errors: [] });
  });

  it("sends stage 2 at Day 7", async () => {
    const { result, dispatched, marked } = await run([
      reference({
        created_at: "2026-08-08T09:00:00.000Z",
        reminder_stage: 1,
      }),
    ]);
    assert.deepEqual(dispatched, [2]);
    assert.deepEqual(marked, [2]);
    assert.equal(result.sent, 1);
  });

  it("skips expired rows", async () => {
    const { result, dispatched, marked } = await run([
      reference({ token_expires_at: "2026-08-15T08:59:59.000Z" }),
    ]);
    assert.deepEqual(dispatched, []);
    assert.deepEqual(marked, []);
    assert.equal(result.sent, 0);
  });

  it("restarts the reminder schedule from the most recent resend", () => {
    assert.equal(
      nextReferenceReminderStage(
        reference({
          created_at: "2026-08-01T09:00:00.000Z",
          last_resend_at: "2026-08-13T09:00:00.000Z",
        }),
        NOW,
      ),
      null,
    );
  });

  it("skips corrupt token expiry timestamps", () => {
    assert.equal(
      nextReferenceReminderStage(
        reference({ token_expires_at: "not-a-timestamp" }),
        NOW,
      ),
      null,
    );
  });
});
