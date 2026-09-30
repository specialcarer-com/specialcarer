import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { CONTRACT_MARKDOWN } from "./markdown.generated";
import { getContractMarkdown } from "./registry";

test("every bundled contract is byte-identical to its immutable Markdown source", () => {
  const directory = new URL("./", import.meta.url);
  const sources = readdirSync(directory).filter((name) => name.endsWith(".md")).sort();
  assert.deepEqual(Object.keys(CONTRACT_MARKDOWN).sort(), sources.map((name) => name.slice(0, -3)));
  for (const name of sources) {
    assert.deepEqual(Buffer.from(getContractMarkdown(name.slice(0, -3)), "utf8"),
      readFileSync(new URL(name, directory)), name);
  }
  assert.ok(Object.isFrozen(CONTRACT_MARKDOWN));
});

test("contract lookup refuses malformed and unknown versions without filesystem access", () => {
  for (const version of ["../secret", "__proto__", "msa-v1.1-2026-08.md", ""]) {
    assert.throws(() => getContractMarkdown(version), /Invalid contract version/);
  }
  assert.throws(() => getContractMarkdown("msa-v999.0-2099-01"), /Unknown contract version/);
  const registry = readFileSync(new URL("./registry.ts", import.meta.url), "utf8");
  assert.doesNotMatch(registry, /node:fs|readFile|process\.cwd/);
});

test("contract generation check is deterministic and does not rewrite the bundle", () => {
  const file = new URL("./markdown.generated.ts", import.meta.url);
  const before = readFileSync(file);
  execFileSync(process.execPath, ["scripts/sync-contracts.mjs", "--check"]);
  assert.deepEqual(readFileSync(file), before);
});
