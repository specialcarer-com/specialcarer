import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  renderReferenceInviteEmail,
  renderReferenceReminderStage1Email,
  renderReferenceReminderStage2Email,
  renderReferenceReminderStage3Email,
} from "./templates";

const link = "https://www.specialcarer.com/r/example-token";
const common = {
  refereeName: "Morgan Smith",
  carerName: "Aisha Khan",
  link,
  expiresAtIso: "2026-08-22T09:00:00.000Z",
  referenceType: "employer" as const,
};

describe("reference email templates", () => {
  it("includes wordmark, teal accent, support phone, and fallback URL", () => {
    const emails = [
      renderReferenceInviteEmail(common),
      renderReferenceReminderStage1Email({
        ...common,
        declineLink: `${link}?decline=1`,
      }),
      renderReferenceReminderStage2Email({
        ...common,
        declineLink: `${link}?decline=1`,
      }),
      renderReferenceReminderStage3Email({
        ...common,
        declineLink: `${link}?decline=1`,
      }),
    ];

    for (const email of emails) {
      assert.match(email.html, /https:\/\/www\.specialcarer\.com\/brand\/wordmark-teal\.png/);
      assert.match(email.html, /border-top:5px solid #039EA0/);
      assert.match(email.html, /020 3966 0000/);
      assert.match(email.text, new RegExp(link));
    }
  });

  it("falls back safely for legacy or missing reference types", () => {
    for (const referenceType of [undefined, "legacy-type"] as const) {
      const email = renderReferenceInviteEmail({ ...common, referenceType });
      assert.match(email.html, /has asked you to provide a reference/);
      assert.match(email.text, /has asked you to provide a reference/);
    }
  });

  it("derives final reminder days remaining from the expiry timestamp", () => {
    const email = renderReferenceReminderStage3Email({
      ...common,
      declineLink: `${link}?decline=1`,
      now: new Date("2026-08-20T09:00:00.000Z"),
    });
    assert.match(email.subject, /expires in 2 days/);
    assert.match(email.html, /expires in 2 days/);
  });
});
