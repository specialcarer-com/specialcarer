/**
 * Source-shape tests for /settings/data (PR E2; flag removed in F1c).
 *
 * Same static-check harness as src/app/m/onboarding/page.test.tsx —
 * the page itself is a server component that imports Supabase and
 * next/navigation, both of which need a Next runtime to execute. We
 * assert the contract by reading the file text and looking for the
 * two guarantees:
 *
 *   1. Unauthenticated -> redirect("/login?...")
 *   2. Authenticated -> renders the client with the caller's
 *      dsar_requests + account_deletion_jobs
 *
 * We also spot-check the client component surface so a rename would
 * be caught here rather than in the browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
const CLIENT = readFileSync(
  resolve(__dirname, "data-rights-client.tsx"),
  "utf8",
);

test("unauthenticated -> redirect to signin with return path", () => {
  assert.match(
    PAGE,
    /if \(!user\) redirect\("\/login\?redirect=\/settings\/data"\)/,
  );
});

test("authenticated -> loads caller's dsar_requests via subject_user_id filter", () => {
  // The select goes through RLS (dsar_requests_subject_read policy),
  // so the .eq() call is defence in depth. Assert both are present so
  // a refactor can't accidentally drop the filter.
  assert.match(PAGE, /\.from\("dsar_requests"\)/);
  assert.match(PAGE, /\.eq\("subject_user_id", user\.id\)/);
  assert.match(
    PAGE,
    /"id, request_type, state, created_at, verified_at, delivered_at, delivery_object_path"/,
  );
});

test("authenticated -> also loads account_deletion_jobs read-only", () => {
  assert.match(PAGE, /\.from\("account_deletion_jobs"\)/);
  assert.match(PAGE, /\.eq\("user_id", user\.id\)/);
});

test("page renders DataRightsClient with prefilled subject_user_id + subject_email", () => {
  assert.match(PAGE, /<DataRightsClient/);
  assert.match(PAGE, /subjectUserId={user\.id}/);
  assert.match(PAGE, /subjectEmail={user\.email \?\? ""}/);
});

test("page links to /settings/danger-zone for erasure (no duplicate delete UI)", () => {
  assert.match(PAGE, /href="\/settings\/danger-zone"/);
});

test("dynamic = force-dynamic so per-request auth actually runs", () => {
  assert.match(PAGE, /export const dynamic = "force-dynamic"/);
});

test("client: radio group covers exactly the three non-erasure types", () => {
  assert.match(CLIENT, /\baccess:/);
  assert.match(CLIENT, /\brectification:/);
  assert.match(CLIENT, /\bportability:/);
  // Erasure must NOT appear as a form option — it lives at danger-zone.
  // (It appears in STATE_PILL because delivered erasures still show
  // up in the history list; assert on KIND_LABEL specifically.)
  const kindLabelBlock = CLIENT.match(
    /const KIND_LABEL: Record<Kind, string> = \{[\s\S]+?\};/,
  );
  assert.ok(kindLabelBlock, "KIND_LABEL const must exist");
  assert.doesNotMatch(kindLabelBlock[0], /erasure/);
});

test("client: POSTs to /api/dsar/submit with all four fields", () => {
  assert.match(CLIENT, /fetch\("\/api\/dsar\/submit"/);
  assert.match(CLIENT, /subject_email: subjectEmail/);
  assert.match(CLIENT, /subject_user_id: subjectUserId/);
  assert.match(CLIENT, /request_type: kind/);
  assert.match(CLIENT, /notes: notes \|\| null/);
});

test("client: delivered rows expose a Download link that hits the signed-URL route", () => {
  assert.match(CLIENT, /href={`\/api\/dsar\/\$\{d\.id\}\/download`}/);
});

test("client: deletion jobs section links back to /settings/danger-zone", () => {
  assert.match(CLIENT, /href="\/settings\/danger-zone"/);
});
