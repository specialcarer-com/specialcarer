import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("cf:build and cf:preview set CLOUDFLARE_BUILD=1 so next.config.ts can scope Cloudflare-only behaviour", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["cf:build"], /CLOUDFLARE_BUILD=1/);
  assert.match(pkg.scripts["cf:preview"], /CLOUDFLARE_BUILD=1/);
});

test("next.config.ts only disables image optimization for the Cloudflare build, leaving Vercel's default untouched", () => {
  const source = readFileSync("next.config.ts", "utf8");
  assert.match(source, /process\.env\.CLOUDFLARE_BUILD === "1"/);
  assert.match(source, /images:\s*isCloudflareBuild\s*\?\s*\{\s*unoptimized:\s*true\s*\}\s*:\s*undefined/);
});
