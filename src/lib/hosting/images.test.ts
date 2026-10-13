import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("cf:build and cf:preview set CLOUDFLARE_BUILD=1 so next.config.ts can scope Cloudflare-only behaviour", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["cf:build"], /CLOUDFLARE_BUILD=1/);
  assert.match(pkg.scripts["cf:preview"], /CLOUDFLARE_BUILD=1/);
});

test("next.config.ts uses a custom Cloudflare image loader, not images.unoptimized which still pulls in sharp", () => {
  const source = readFileSync("next.config.ts", "utf8");
  assert.match(source, /process\.env\.CLOUDFLARE_BUILD === "1"/);
  assert.match(
    source,
    /images:\s*isCloudflareBuild\s*\?\s*\{\s*loader:\s*"custom",\s*loaderFile:\s*"\.\/cloudflare-image-loader\.ts"\s*\}\s*:\s*undefined/,
  );
  assert.doesNotMatch(source, /serverExternalPackages/, "serverExternalPackages does not exempt the image route from bundling; do not rely on it here");
});

test("the Cloudflare image loader returns the source URL unmodified (no sharp, no transformation)", () => {
  const source = readFileSync("cloudflare-image-loader.ts", "utf8");
  assert.match(source, /export default function identityLoader/);
  // Strip the file's leading block comment before checking: it documents
  // *why* sharp is avoided and necessarily mentions it — including the
  // literal text `require("sharp")` as inline code — so checking the raw
  // file text produces a false failure on the documentation, not the code.
  // (First correction attempt still matched this exact string; verified
  // against the actual file content before landing on stripping comments.)
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(codeOnly, /sharp/i, "the loader's actual code must never reference sharp");
});
