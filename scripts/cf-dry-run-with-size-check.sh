#!/usr/bin/env bash
# Runs the Cloudflare dry-run package step, then checks the reported gzip
# size against the safety threshold in check-cloudflare-bundle-size.mjs.
#
# A plain `wrangler ... | node check-....mjs` pipeline would only propagate
# the exit code of the last command (the check script), silently hiding a
# real wrangler failure if the check script still happened to run/exit 0.
# `set -o pipefail` makes the pipeline fail if EITHER command fails.
set -euo pipefail

wrangler deploy --dry-run --minify --outdir .cloudflare-dry-run 2>&1 \
  | node "$(dirname "$0")/check-cloudflare-bundle-size.mjs"
