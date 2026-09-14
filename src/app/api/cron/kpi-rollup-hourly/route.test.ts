/**
 * Route-level tests for /api/cron/kpi-rollup-hourly (E5).
 *
 * We validate the surface behaviour that route.ts owns exclusively:
 *   - auth is enforced
 *   - missing SUPABASE_SERVICE_ROLE_KEY returns { ok: false, error:
 *     'service_role_missing' } with a 500
 *
 * The full end-to-end derivation is tested at the derive layer
 * (derive.test.ts) with a stub client — mocking `createAdminClient`
 * from an ESM module can't be done with plain node:test on Node 20 as
 * used by this repo, so we keep the derivation-shape assertions in
 * derive.test.ts and the client-wiring assertions here.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const CRON_KEY = "CRON_SECRET";
const SRK = "SUPABASE_SERVICE_ROLE_KEY";
const cronOriginal = process.env[CRON_KEY];
const srkOriginal = process.env[SRK];

before(() => {
  process.env[CRON_KEY] = "test-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
});

after(() => {
  if (cronOriginal === undefined) delete process.env[CRON_KEY];
  else process.env[CRON_KEY] = cronOriginal;
  if (srkOriginal === undefined) delete process.env[SRK];
  else process.env[SRK] = srkOriginal;
});

function makeReq(auth: string | null = "Bearer test-secret") {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? auth : null,
    },
  } as never;
}

test("cron rejects unauthorised callers", async () => {
  const mod = await import(
    `./route.ts?ts=${Date.now()}-${Math.random()}`
  );
  const res: Response = await mod.GET(makeReq(null));
  assert.equal(res.status, 401);
});

test("cron returns service_role_missing when the env var is absent", async () => {
  delete process.env[SRK];
  const mod = await import(
    `./route.ts?ts=${Date.now()}-${Math.random()}`
  );
  const res: Response = await mod.GET(makeReq());
  assert.equal(res.status, 500);
  const body = (await res.json()) as { ok?: boolean; error?: string };
  assert.equal(body.ok, false);
  assert.equal(body.error, "service_role_missing");
});
