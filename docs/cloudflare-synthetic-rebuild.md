# Synthetic Cloudflare rebuild: local-only verification

This recipe tests packaging of the unshipped portability changes. It is **not**
a configured production build, integration test or deployment instruction.
It uses the same deliberately unusable public Supabase/Stripe placeholders as
the one-shot compatibility workflow; public app origins are also local-only.

## Preconditions

- Node 22 and the existing locked dependencies (`package-lock.json`).
- Sufficient local memory: the full repository typecheck needs more than the
  default approximately 2 GiB heap in this sandbox; use a 6 GiB heap.
- No `.env*` files other than `.env.example`, and no `.dev.vars*` files. Next and
  Wrangler load these themselves even when the process environment is cleared.
  If any are present, stop for review; do not print their values.
- No integration or Cloudflare account credentials in the child environment.
  Use a separate empty HOME to avoid inherited CLI login/configuration.
- Preserve any previously accepted build before overwriting outputs. The
  previously accepted synthetic build is not the current source tree.
- No deploy, preview-server, cache-population or scheduler activation command.

## Reproducible local commands

From the repository root, point `NODE22_BIN` to a verified Node 22 installation
and `BUILD_HOME` to a newly created, empty directory outside the repository.
The following function intentionally discards inherited environment variables:

```sh
NODE22_BIN=/absolute/path/to/node22/bin
BUILD_HOME=/absolute/path/to/empty-build-home
mkdir -p "$BUILD_HOME"

synthetic() {
  env -i \
    PATH="$NODE22_BIN:/usr/local/bin:/usr/bin:/bin" \
    HOME="$BUILD_HOME" TMPDIR=/tmp LANG=C.UTF-8 \
    CI=true NEXT_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false \
    NODE_OPTIONS=--max-old-space-size=6144 \
    APP_ENV=preview NEXT_PUBLIC_APP_ENV=preview \
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=compatibility-build-placeholder \
    NEXT_PUBLIC_APP_URL=http://127.0.0.1:9 \
    NEXT_PUBLIC_SITE_URL=http://127.0.0.1:9 \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_compatibility_placeholder \
    "$@"
}

synthetic node --version
synthetic npm run contracts:check
synthetic npm run test:hosting
synthetic npm run cf:build
synthetic npm run cf:dry-run
synthetic npm run typecheck
```

`cf:build` checks the generated Markdown and invokes the Next/OpenNext build.
`cf:dry-run` writes the minified module without uploading it. Run the full
typecheck **after** building so generated Next route validators are included;
Next's existing `ignoreBuildErrors` option does not replace this check.

For this workspace, `/home/user/workspace/cloudflare-transfer/run-synthetic-build.py`
implements the same isolated environment, refuses dotenv files, records Node
version and source commit, and writes separate build/packaging/typecheck/test
logs plus `synthetic-build-status.json`. It does not read account credentials or
deploy. Its source fingerprint must be recorded together with the uncommitted
patch; a commit SHA alone does not identify these local changes.

The existing app imports Google fonts during compilation. Build tools may also
emit anonymous diagnostics/telemetry; absent provider credentials prevents
private Sentry source-map/release uploads, but is not a claim that the compiler
has zero network traffic. This recipe does not configure live application
providers or exercise production workflows.

## Checks on the rebuilt output

1. The four immutable Markdown versions must appear as **exact string values**
   in the minified `.cloudflare-dry-run/worker.js`, not only in staging files.
   Check each version's heading, UTF-8 byte count and SHA-256.
2. `.open-next/assets/_headers` and `.assetsignore` must match their `public/`
   sources byte-for-byte. Neither is an ordinary upload asset.
3. All `.map` files must be excluded from the upload manifest. Their continued
   presence on the local disk does not mean they are publicly uploaded.
4. Record Worker module bytes/hash, external module imports, asset path count,
   unique hashes and total bytes. Check size limits again for the new artifact.
5. Retain `APP_ENV=preview`, URL exposure disabled, no public/domain routes and
   no scheduled triggers. The separate scheduler stays disabled.
6. No private credentials appear in the manifest. Public placeholders must be
   clearly labelled synthetic; they do not demonstrate functional Supabase,
   Stripe, email or authentication behaviour.

The outside-repository `inspect-rebuilt.cjs` is a read-only inspection tool:

```sh
node /home/user/workspace/cloudflare-transfer/inspect-rebuilt.cjs \
  /home/user/workspace/outreach-view-followup \
  > /home/user/workspace/cloudflare-transfer/rebuilt-artifact-map.json
```

It parses the bundle without executing it, verifies all contract literal values,
checks the known static control files and constructs non-secret asset metadata.

## Direct-upload metadata: important difference from the old artifact

The installed Wrangler 4.134.0 reads `_headers` as UTF-8 and sends its **raw file
contents** in `metadata.assets.config._headers`. A direct uploader must carry
that field alongside the in-memory provider completion JWT. `.assetsignore`
controls local manifest construction; it is neither a public asset nor an API
configuration property.

```json
{
  "assets": {
    "jwt": "<provider completion JWT; memory only>",
    "config": {
      "_headers": "<exact public/_headers text, including newlines>"
    }
  }
}
```

After explicit approval and re-audit, the outside-repository transfer helper is
now pinned to this synthetic candidate's module SHA-256
`2ac0fd9b55a87e4d21a9bc97d5ef6d002f052897c6d90ebc40ae93b36b48347a`,
its complete asset inventory, and the exact header/ignore control bytes.
Its default remains local-only dry-run. A subsequent build must not silently
repin it; review the new mapping, fingerprint and metadata first. Retain its
account/exposure checks and temporary-JWT transport rules. This local helper
update is not evidence that the candidate has been uploaded.

## Route-export fix included in this candidate

The five candour `attachment`, `close`, `disclosure`, `note` and
`regulator-notified` route modules previously exported testable helper values,
which Next's generated route validators reject. Those implementations and
supporting types/constants now live in adjacent `handler.ts` files. The route
entry points retain only `dynamic` and `POST` value exports.

The POST bodies and moved handler function bodies are unchanged. Existing
tests only change their import target, and remain in the normal test command.
`src/lib/hosting/route-exports.test.ts` prevents helper values from being
re-exported from these route entry points.
