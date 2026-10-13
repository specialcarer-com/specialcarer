import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("cf:dry-run is wired through the size-check wrapper, not called directly", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["cf:dry-run"], /cf-dry-run-with-size-check\.sh/);
});

test("the wrapper script uses pipefail so a real wrangler failure can't be masked by the check script's own exit code", () => {
  const source = readFileSync("scripts/cf-dry-run-with-size-check.sh", "utf8");
  assert.match(source, /set -euo pipefail/);
});

function runCheck(input: string) {
  const result = spawnSync(process.execPath, ["scripts/check-cloudflare-bundle-size.mjs"], {
    input,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("passes cleanly at the measured size, 59844.47 KiB uncompressed", () => {
  const result = runCheck("Total Upload: 59844.47 KiB / gzip: 10089.80 KiB\n");
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Worker uncompressed size: 59844\.47 KiB \(91\.3% of the 65536 KiB/);
});

test("passes cleanly just below the 97% uncompressed warning threshold, regardless of gzip size", () => {
  const result = runCheck("Total Upload: 63569.91 KiB / gzip: 20000.00 KiB\n");
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
});

test("warns at the 97% uncompressed threshold (62.08 MiB)", () => {
  const result = runCheck("Total Upload: 63569.92 KiB / gzip: 5000.00 KiB\n");
  assert.equal(result.code, 0);
  assert.match(result.stderr, /WARNING:.*63569\.92 KiB/);
});

test("warns and passes just below the 99% uncompressed failure threshold", () => {
  const result = runCheck("Total Upload: 64880.63 KiB / gzip: 5000.00 KiB\n");
  assert.equal(result.code, 0);
  assert.match(result.stderr, /WARNING:/);
});

test("fails at the 99% uncompressed threshold (63.36 MiB), even with small gzip size", () => {
  const result = runCheck("Total Upload: 64880.64 KiB / gzip: 5000.00 KiB\n");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /FAIL:.*64880\.64 KiB/);
});

test("fails at and above the 64 MiB uncompressed hard cap", () => {
  for (const size of [65536, 70000]) {
    const result = runCheck(`Total Upload: ${size} KiB / gzip: 5000.00 KiB\n`);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /FAIL:/);
  }
});

test("can measure Total Upload without a gzip metric", () => {
  const result = runCheck("Total Upload: 20000.00 KiB\n");
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
});

test("fails safe (does not silently pass) when the expected size line is missing", () => {
  const result = runCheck("some unrelated wrangler output\nwith no matching line\n");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Could not find a 'Total Upload:/);
});
