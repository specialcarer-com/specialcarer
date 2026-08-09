import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliverReferenceResendEmail } from "./reference-resend-delivery";

const message = {
  to: "referee@example.test",
  subject: "Reference invitation",
  html: "<p>Reference invitation</p>",
  text: "Reference invitation",
};

describe("reference resend delivery", () => {
  it("returns a non-200 outcome when the mocked email delivery fails", async () => {
    const sendEmail = async () =>
      ({ ok: false as const, error: "Email transport is not configured" });

    assert.deepEqual(
      await deliverReferenceResendEmail(sendEmail, message),
      {
        ok: false,
        status: 500,
        error: "Email transport is not configured",
      },
    );
  });
});
