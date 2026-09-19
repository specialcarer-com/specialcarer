import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

function runCheck(input) {
  try {
    const stdout = execFileSync("node", ["scripts/check-cloudflare-bundle-size.mjs"], {
      input,
      encoding: "utf8",
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

test("passes (with a warning) at the currently-measured real size, 10089.80 KiB gzip", () => {
  const result = runCheck("Total Upload: 59844.47 KiB / gzip: 10089.80 KiB\n");
  assert.equal(result.code, 0);
});

test("fails once size crosses the 99%-of-cap threshold (~9.9 MiB)", () => {
  const result = runCheck("Total Upload: 60000.00 KiB / gzip: 10150.00 KiB\n");
  assert.notEqual(result.code, 0);
});

test("passes cleanly well under the threshold", () => {
  const result = runCheck("Total Upload: 20000.00 KiB / gzip: 5000.00 KiB\n");
  assert.equal(result.code, 0);
});

test("fails safe (does not silently pass) when the expected size line is missing", () => {
  const result = runCheck("some unrelated wrangler output\nwith no matching line\n");
  assert.notEqual(result.code, 0);
});
