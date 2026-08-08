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
});
