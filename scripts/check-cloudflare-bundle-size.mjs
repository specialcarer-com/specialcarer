#!/usr/bin/env node
/**
 * Fails loudly if the Cloudflare Worker's uncompressed size is too close to
 * the platform's hard 64 MiB limit.
 *
 * Context (see docs/cloudflare-hosting-portability.md, "Bundle size"):
 * as of commit b2222c5, the built Worker is ~58.44 MiB uncompressed against
 * a 64 MiB cap - about 8.7% headroom - mostly React Server Components
 * client-reference-manifest data that scales with route count (~64 KB per
 * route; this app has 675). This is a known, currently-unfixed upstream
 * limitation (opennextjs/opennextjs-cloudflare#1294), not something we can
 * patch on our side without forking the adapter. The accepted mitigation
 * (deliberate decision, not a default) is: monitor via this threshold, and
 * treat a failure here as the trigger to either free up headroom (remove
 * unused routes, wait for an upstream fix) or finally do the Multi-Worker
 * split - not to raise this threshold without discussion.
 *
 * Usage: npm run cf:dry-run -- --outdir .cloudflare-dry-run 2>&1 | node scripts/check-cloudflare-bundle-size.mjs
 * (wired into `cf:dry-run` itself - see package.json)
 */

const WORKER_UNCOMPRESSED_LIMIT_KIB = 64 * 1024; // 64 MiB, per Cloudflare's uncompressed Worker size limit
const WARN_AT_KIB = WORKER_UNCOMPRESSED_LIMIT_KIB * 0.97; // 62.08 MiB: warn with headroom to react
const FAIL_AT_KIB = WORKER_UNCOMPRESSED_LIMIT_KIB * 0.99; // 63.36 MiB: fail before we're at the actual cap

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  process.stdout.write(chunk); // pass through so the normal build log is unaffected
});

process.stdin.on("end", () => {
  const match = input.match(/Total Upload:\s*(\d+(?:\.\d+)?)\s*KiB\b/i);
  if (!match) {
    console.error(
      "\n[cloudflare-bundle-size] Could not find a 'Total Upload: ... KiB' line in the " +
        "wrangler output above. This check is a no-op if wrangler's output format changes - " +
        "update the regex in scripts/check-cloudflare-bundle-size.mjs rather than silently trusting an unmatched build.",
    );
    process.exit(1);
  }

  const uncompressedKib = Number.parseFloat(match[1]);
  const pctOfLimit = (uncompressedKib / WORKER_UNCOMPRESSED_LIMIT_KIB) * 100;

  console.log(
    `\n[cloudflare-bundle-size] Worker uncompressed size: ${uncompressedKib.toFixed(2)} KiB ` +
      `(${pctOfLimit.toFixed(1)}% of the ${WORKER_UNCOMPRESSED_LIMIT_KIB} KiB uncompressed Worker limit)`,
  );

  if (uncompressedKib >= FAIL_AT_KIB) {
    console.error(
      `[cloudflare-bundle-size] FAIL: ${uncompressedKib.toFixed(2)} KiB is at or above the ${FAIL_AT_KIB.toFixed(2)} KiB ` +
        "safety threshold (99% of the hard cap). See docs/cloudflare-hosting-portability.md, 'Bundle size' - " +
        "this is the trigger to act (free up headroom or prioritise the Multi-Worker split), not to raise this number.",
    );
    process.exit(1);
  }

  if (uncompressedKib >= WARN_AT_KIB) {
    console.warn(
      `[cloudflare-bundle-size] WARNING: ${uncompressedKib.toFixed(2)} KiB is at or above the ${WARN_AT_KIB.toFixed(2)} KiB ` +
        "early-warning threshold (97% of the hard cap). Still passing, but headroom is shrinking.",
    );
  }
});
