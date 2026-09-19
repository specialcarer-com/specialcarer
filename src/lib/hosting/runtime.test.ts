import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isCloudflareWorkersRuntime } from "./runtime";

test("isCloudflareWorkersRuntime is false in this Node test environment", () => {
  assert.equal(isCloudflareWorkersRuntime(), false);
});

test("isCloudflareWorkersRuntime matches Cloudflare's own documented detection string", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "Cloudflare-Workers" },
    configurable: true,
  });
  try {
    assert.equal(isCloudflareWorkersRuntime(), true);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalDescriptor);
    } else {
      // @ts-expect-error - restoring to the pre-test undefined state
      delete globalThis.navigator;
    }
  }
});

test("smtp.ts never imports nodemailer eagerly, and checks the Cloudflare guard before touching it", () => {
  const source = readFileSync("src/lib/email/smtp.ts", "utf8");
  assert.doesNotMatch(source, /^import nodemailer/m, "nodemailer must not be a static top-level import");
  assert.match(source, /await import\("nodemailer"\)/, "nodemailer must be dynamically imported");
  assert.match(source, /isCloudflareWorkersRuntime\(\)/, "getSmtp must check the Cloudflare guard");
});
