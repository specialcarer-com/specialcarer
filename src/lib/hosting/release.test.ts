import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveReleaseSha } from "./release";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("prefers VERCEL_GIT_COMMIT_SHA when present (existing Vercel behaviour unchanged)", () => {
  withEnv({ VERCEL_GIT_COMMIT_SHA: "vercel-sha", GITHUB_SHA: "github-sha" }, () => {
    assert.equal(resolveReleaseSha(), "vercel-sha");
  });
});

test("falls back to GITHUB_SHA when VERCEL_GIT_COMMIT_SHA is absent (Cloudflare build path)", () => {
  withEnv({ VERCEL_GIT_COMMIT_SHA: undefined, GITHUB_SHA: "github-sha" }, () => {
    assert.equal(resolveReleaseSha(), "github-sha");
  });
});

test("returns undefined, not an empty string, when neither is set (local dev)", () => {
  withEnv({ VERCEL_GIT_COMMIT_SHA: undefined, GITHUB_SHA: undefined }, () => {
    assert.equal(resolveReleaseSha(), undefined);
  });
});

test("both sentry.server.config.ts and sentry.edge.config.ts use the provider-neutral resolver, not the Vercel-only variable", () => {
  for (const file of ["sentry.server.config.ts", "sentry.edge.config.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /resolveReleaseSha\(\)/, `${file}: should call resolveReleaseSha()`);
    assert.doesNotMatch(
      source,
      /release:\s*process\.env\.VERCEL_GIT_COMMIT_SHA/,
      `${file}: should not read the Vercel-only variable directly`,
    );
  }
});
