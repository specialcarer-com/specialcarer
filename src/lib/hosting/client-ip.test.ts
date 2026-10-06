import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { extractClientIp, isCloudflareRuntime } from "./client-ip";

function headersFrom(map: Record<string, string>) {
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

const onCloudflare = { trustCfConnectingIp: true } as const;
const offCloudflare = { trustCfConnectingIp: false } as const;

test("on Cloudflare, CF-Connecting-IP is trusted first, even when X-Forwarded-For is also present", () => {
  assert.equal(
    extractClientIp(
      headersFrom({ "CF-Connecting-IP": "203.0.113.9", "X-Forwarded-For": "10.0.0.1, 203.0.113.9" }),
      onCloudflare,
    ),
    "203.0.113.9",
  );
});

test("on Cloudflare, a spoofed X-Forwarded-For cannot override a real CF-Connecting-IP", () => {
  // The Cloudflare spoofing scenario: an attacker sets their own
  // X-Forwarded-For; Cloudflare still reports the true IP via CF-Connecting-IP.
  assert.equal(
    extractClientIp(headersFrom({ "CF-Connecting-IP": "198.51.100.1", "X-Forwarded-For": "1.2.3.4" }), onCloudflare),
    "198.51.100.1",
  );
});

test("off Cloudflare (Vercel), a client-supplied CF-Connecting-IP is ignored", () => {
  // The Vercel spoofing scenario: nothing strips this header, so an attacker
  // can send any value. The platform-set X-Forwarded-For must win.
  assert.equal(
    extractClientIp(headersFrom({ "CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "203.0.113.9, 10.0.0.1" }), offCloudflare),
    "203.0.113.9",
  );
});

test("off Cloudflare, a lone CF-Connecting-IP is not trusted and yields null", () => {
  assert.equal(extractClientIp(headersFrom({ "CF-Connecting-IP": "1.2.3.4" }), offCloudflare), null);
});

test("by default the runtime decides: plain Node (CI, Vercel) does not trust CF-Connecting-IP", () => {
  assert.equal(isCloudflareRuntime(), false);
  assert.equal(
    extractClientIp(headersFrom({ "CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "203.0.113.9" })),
    "203.0.113.9",
  );
});

test("isCloudflareRuntime is true only when navigator.userAgent is Cloudflare-Workers", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Cloudflare-Workers" }, configurable: true });
    assert.equal(isCloudflareRuntime(), true);
    Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Node.js/22" }, configurable: true });
    assert.equal(isCloudflareRuntime(), false);
    Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
    assert.equal(isCloudflareRuntime(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});

test("falls back to X-Forwarded-For's first entry when CF-Connecting-IP is absent (Vercel)", () => {
  assert.equal(extractClientIp(headersFrom({ "X-Forwarded-For": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
});

test("falls back to X-Real-IP when neither Cloudflare nor X-Forwarded-For is present", () => {
  assert.equal(extractClientIp(headersFrom({ "X-Real-IP": "203.0.113.9" })), "203.0.113.9");
});

test("trims whitespace and ignores blank/whitespace-only header values", () => {
  assert.equal(extractClientIp(headersFrom({ "CF-Connecting-IP": "  203.0.113.9  " }), onCloudflare), "203.0.113.9");
  assert.equal(
    extractClientIp(headersFrom({ "CF-Connecting-IP": "   ", "X-Forwarded-For": " , 203.0.113.9" }), onCloudflare),
    "203.0.113.9",
  );
});

test("skips multiple empty forwarded entries and keeps the first non-empty address", () => {
  assert.equal(
    extractClientIp(headersFrom({ "X-Forwarded-For": " , , 203.0.113.9 , 198.51.100.1" })),
    "203.0.113.9",
  );
});

test("falls back to X-Real-IP when every forwarded entry is blank", () => {
  assert.equal(
    extractClientIp(headersFrom({ "X-Forwarded-For": " , , ", "X-Real-IP": " 203.0.113.9 " })),
    "203.0.113.9",
  );
});

test("returns null when all forwarding headers are blank", () => {
  assert.equal(
    extractClientIp(
      headersFrom({ "CF-Connecting-IP": " ", "X-Forwarded-For": " , , ", "X-Real-IP": " " }),
      onCloudflare,
    ),
    null,
  );
});

test("returns null, not a placeholder string, when nothing is present", () => {
  assert.equal(extractClientIp(headersFrom({})), null);
  assert.equal(extractClientIp(headersFrom({ "X-Forwarded-For": "" })), null);
});

test("every previously-duplicated call site now delegates to the shared helper", () => {
  const sites = [
    "src/lib/rate-limit.ts",
    "src/lib/admin/auth.ts",
    "src/app/api/references/submit/submit-handler.ts",
    "src/app/api/m/org/register/sign-contracts/route.ts",
    "src/app/api/agency-optin/sign-contract/route.ts",
    "src/app/api/bookings/[id]/timesheet/approve/route.ts",
    "src/app/api/carer/reference-consents/consent-handler.ts",
  ];
  for (const file of sites) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /extractClientIp\(/, `${file}: should call the shared helper`);
    assert.doesNotMatch(
      source,
      /headers?\.get\(["']x-forwarded-for["']\)/i,
      `${file}: should not re-parse x-forwarded-for directly`,
    );
  }
});
