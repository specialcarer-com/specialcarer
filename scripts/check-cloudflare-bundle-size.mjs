#!/usr/bin/env node
/**
 * Fails loudly if the Cloudflare Worker's compressed size is too close to
 * the platform's hard 10 MiB (Workers Paid plan) limit.
 *
 * Context (see docs/cloudflare-hosting-portability.md, "Bundle size"):
 * as of commit b2222c5, the built Worker is ~9.85 MiB gzip against a 10 MiB
 * cap - about 1.5% headroom - almost entirely React Server Components
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

const WORKERS_PAID_PLAN_LIMIT_KIB = 10 * 1024; // 10 MiB, per Cloudflare's documented Worker size limit
const WARN_AT_KIB = WORKERS_PAID_PLAN_LIMIT_KIB * 0.97; // ~9.7 MiB: warn with headroom to react
const FAIL_AT_KIB = WORKERS_PAID_PLAN_LIMIT_KIB * 0.99; // ~9.9 MiB: fail before we're at the actual cap

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  process.stdout.write(chunk); // pass through so the normal build log is unaffected
});

process.stdin.on("end", () => {
  const match = input.match(/Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/i);
  if (!match) {
    console.error(
      "\n[cloudflare-bundle-size] Could not find a 'Total Upload: ... / gzip: ...' line in the " +
        "wrangler output above. This check is a no-op if wrangler's output format changes - " +
        "update the regex in scripts/check-cloudflare-bundle-size.mjs rather than silently trusting an unmatched build.",
    );
    process.exit(1);
  }

  const gzipKib = Number.parseFloat(match[2]);
  const pctOfLimit = (gzipKib / WORKERS_PAID_PLAN_LIMIT_KIB) * 100;

  console.log(
    `\n[cloudflare-bundle-size] Worker gzip size: ${gzipKib.toFixed(2)} KiB ` +
      `(${pctOfLimit.toFixed(1)}% of the ${WORKERS_PAID_PLAN_LIMIT_KIB} KiB Workers Paid plan limit)`,
  );

  if (gzipKib >= FAIL_AT_KIB) {
    console.error(
      `[cloudflare-bundle-size] FAIL: ${gzipKib.toFixed(2)} KiB is at or above the ${FAIL_AT_KIB.toFixed(0)} KiB ` +
        "safety threshold (99% of the hard cap). See docs/cloudflare-hosting-portability.md, 'Bundle size' - " +
        "this is the trigger to act (free up headroom or prioritise the Multi-Worker split), not to raise this number.",
    );
    process.exit(1);
  }

  if (gzipKib >= WARN_AT_KIB) {
    console.warn(
      `[cloudflare-bundle-size] WARNING: ${gzipKib.toFixed(2)} KiB is above the ${WARN_AT_KIB.toFixed(0)} KiB ` +
        "early-warning threshold (97% of the hard cap). Still passing, but headroom is shrinking.",
    );
  }
});
