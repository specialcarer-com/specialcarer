import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authoriseReferenceReminderCron } from "./auth";

describe("reference reminders cron authentication", () => {
  it("returns 401 when CRON_SECRET is not configured", async () => {
    assert.deepEqual(authoriseReferenceReminderCron(null, undefined), {
      ok: false,
      status: 401,
      error: "CRON_SECRET not configured",
    });
  });
});
