import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

test("immutable browser caching is restricted to Next build assets", () => {
  const lines = readFileSync("public/_headers", "utf8").split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#"));
  assert.deepEqual(lines, ["/_next/static/*", "  Cache-Control: public, max-age=31536000, immutable"]);
});

test("Wrangler-compatible ignore rules exclude all source maps, not app assets", () => {
  // Use the same ignore package used by the installed Wrangler asset manifest builder.
  const require = createRequire(import.meta.url);
  const ignore = require("ignore") as () => { add(patterns: string): { ignores(path: string): boolean } };
  const matcher = ignore().add(readFileSync("public/.assetsignore", "utf8"));
  for (const path of ["_next/static/css/example.css.map", "_next/static/chunks/main.js.map", "root.map"]) {
    assert.equal(matcher.ignores(path), true);
  }
  for (const path of ["_next/static/css/example.css", "_next/static/chunks/main.js", "brand/logo.svg", "video/hero.mp4"]) {
    assert.equal(matcher.ignores(path), false);
  }
});
