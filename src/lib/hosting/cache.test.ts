import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("wrangler.jsonc binds NEXT_INC_CACHE_KV to a real namespace id, alongside the self-reference service binding", () => {
  // This JSONC has only full-line comments, so strip those before parsing.
  const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""));
  assert.equal(Array.isArray(config.kv_namespaces), true);
  assert.equal(config.kv_namespaces.length, 1);
  assert.equal(config.kv_namespaces[0].binding, "NEXT_INC_CACHE_KV");
  assert.match(config.kv_namespaces[0].id, /^[0-9a-f]{32}$/);
  // OpenNext's KV incremental cache re-renders through the app's own Worker;
  // this self-reference must already exist for it to work.
  assert.deepEqual(config.services, [{ binding: "WORKER_SELF_REFERENCE", service: "specialcarer-preview" }]);
});

test("open-next.config.ts wires the KV incremental cache override, not the no-op default", () => {
  const source = readFileSync("open-next.config.ts", "utf8");
  assert.match(source, /from "@opennextjs\/cloudflare\/overrides\/incremental-cache\/kv-incremental-cache"/);
  assert.match(source, /incrementalCache:\s*kvIncrementalCache/);
});
