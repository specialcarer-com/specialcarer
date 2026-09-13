/**
 * Tests for invitation-email.ts (Phase D — PR D1).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { logSafePayload, renderInvitationEmail } from "./invitation-email";

const TOKEN = "SECRETTOKEN_abcdef123456";
const ACCEPT_URL = `https://app.example.com/org/invitations/accept?token=${TOKEN}`;

function inSevenDays(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

describe("renderInvitationEmail()", () => {
  test("subject includes the org name", () => {
    const out = renderInvitationEmail({
      orgName: "AcmeCare",
      inviterName: "Alice",
      role: "admin",
      acceptUrl: ACCEPT_URL,
      expiresAt: inSevenDays(),
    });
    assert.match(out.subject, /AcmeCare/);
  });

  test("html and text both contain the accept url", () => {
    const out = renderInvitationEmail({
      orgName: "AcmeCare",
      inviterName: "Alice",
      role: "admin",
      acceptUrl: ACCEPT_URL,
      expiresAt: inSevenDays(),
    });
    assert.ok(out.html.includes(ACCEPT_URL));
    assert.ok(out.text.includes(ACCEPT_URL));
  });

  test("role label is rendered in a human-friendly form", () => {
    for (const role of ["admin", "booker", "finance", "viewer"] as const) {
      const out = renderInvitationEmail({
        orgName: "AcmeCare",
        inviterName: "Alice",
        role,
        acceptUrl: ACCEPT_URL,
        expiresAt: inSevenDays(),
      });
      // Text version should include the role token in some form.
      assert.match(
        out.text.toLowerCase(),
        new RegExp(role),
        `role ${role} not present in text`,
      );
    }
  });

  test("html escapes hostile org / inviter names", () => {
    const out = renderInvitationEmail({
      orgName: '<img src=x onerror="alert(1)">',
      inviterName: "Eve <script>",
      role: "viewer",
      acceptUrl: ACCEPT_URL,
      expiresAt: inSevenDays(),
    });
    assert.ok(!out.html.includes("<img src=x"));
    assert.ok(!out.html.includes("<script>"));
    assert.ok(out.html.includes("&lt;script&gt;"));
  });

  test("expiry copy mentions days remaining", () => {
    const out = renderInvitationEmail({
      orgName: "AcmeCare",
      inviterName: "Alice",
      role: "admin",
      acceptUrl: ACCEPT_URL,
      expiresAt: inSevenDays(),
    });
    assert.match(out.text, /expires in \d+ day/i);
  });
});

describe("logSafePayload()", () => {
  test("does NOT contain the raw token", () => {
    const payload = logSafePayload({
      orgName: "AcmeCare",
      inviterName: "Alice",
      role: "admin",
      acceptUrl: ACCEPT_URL,
      expiresAt: inSevenDays(),
    });
    const serialised = JSON.stringify(payload);
    assert.ok(
      !serialised.includes(TOKEN),
      `raw token leaked in log-safe payload: ${serialised}`,
    );
    assert.match(payload.acceptUrlHost, /\[redacted\]/);
  });

  test("preserves org + role + expiry for ops observability", () => {
    const expiresAt = inSevenDays();
    const payload = logSafePayload({
      orgName: "AcmeCare",
      inviterName: "Alice",
      role: "booker",
      acceptUrl: ACCEPT_URL,
      expiresAt,
    });
    assert.equal(payload.orgName, "AcmeCare");
    assert.equal(payload.inviterName, "Alice");
    assert.equal(payload.role, "booker");
    assert.equal(payload.expiresAt, expiresAt.toISOString());
    assert.match(payload.acceptUrlHost, /^https:\/\/app\.example\.com/);
  });

  test("degrades gracefully on unparseable accept URL", () => {
    const payload = logSafePayload({
      orgName: "AcmeCare",
      inviterName: "Alice",
      role: "admin",
      acceptUrl: "not a url",
      expiresAt: inSevenDays(),
    });
    assert.equal(payload.acceptUrlHost, "[unparseable-url]");
  });
});
