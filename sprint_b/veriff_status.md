# Sprint B — Veriff Identity Verification — Handoff

**Branch:** `feat/identity-verification-veriff`
**Status:** DRAFT PR open. DO NOT MERGE until manual config (below) is done.
**Flag:** `IDENTITY_VERIFICATION_ENABLED` (default `false`). All routes 403 + UI hidden when off.

## What shipped

Mirrors the Whereby video integration (PR #104/#106): server-only feature flag,
thin Supabase/Veriff adapter + pure injectable handlers, `node:test` + `tsx`
tests registered in `package.json`.

### Files added
- `src/lib/identity/flag.ts` — `isIdentityVerificationEnabled()`
- `src/lib/identity/veriff.ts` — Veriff Station API client (`createSession`, `getDecision`, `signPayload`, `VeriffApiError`)
- `src/lib/identity/webhook.ts` — `verifyVeriffSignature` (HMAC over raw body) + status mapping helpers
- `src/lib/identity/identity-handler.ts` — pure handlers (`handleStartSession`, `handleGetSession`, `handleWebhook`)
- `src/lib/identity/adapter.ts` — `buildIdentityClient()` (Supabase admin + Veriff)
- `src/app/api/m/identity/session/route.ts` — `POST` start (idempotent)
- `src/app/api/m/identity/session/[id]/route.ts` — `GET` status (owner-scoped)
- `src/app/api/m/webhooks/veriff/route.ts` — `POST` webhook (events + decisions, one URL)
- `src/components/identity/VerifyIdentityCard.tsx` — CTA / pending pill / verified badge
- `src/app/m/identity/page.tsx` — dedicated mount + Veriff callback target
- `supabase/migrations/20260616120000_identity_verifications_v1.sql`
- 5 test files (45 new tests)

### Files modified
- `src/app/m/home/SeekerHomeClient.tsx` + `CarerHomeClient.tsx` — mount `VerifyIdentityCard`
- `.env.example` — Veriff env block
- `package.json` — registered 5 new test files in `test` script

## HMAC scheme used (confirmed against devdocs.veriff.com)
- **Auth:** `X-AUTH-CLIENT: VERIFF_API_KEY` on every request.
- **POST signature:** `hex(hmac-sha256(VERIFF_SIGNATURE_KEY, JSON.stringify(body)))`.
- **GET signature:** `hex(hmac-sha256(VERIFF_SIGNATURE_KEY, sessionId))`.
- **Webhook:** `hex(hmac-sha256(VERIFF_SIGNATURE_KEY, rawBody))`, `crypto.timingSafeEqual`.
- Bare lower-case hex (no `sha256=` prefix) per the task spec + repo Whereby
  convention. The webhook verifier ALSO tolerates a `sha256=` prefix defensively.
  **Open question:** some Veriff docs show a `sha256=` prefix on the produced
  signature — if live deliveries arrive prefixed, the verifier already strips it,
  but the client's outbound POST/GET signatures send bare hex. Confirm on staging.

## Test results
- `tsc --noEmit`: clean.
- `npm test`: **860 / 861 pass** (99.88%). The single failure is the
  pre-existing, accepted `grace-period-blast` (`Cannot find module 'server-only'`).
- New tests: 45 (webhook 10, veriff client 11, handler 13, session adapter 2,
  webhook route 5 — plus suite wrappers).

## DO NOT MERGE until
1. Vercel Production env vars set: `VERIFF_API_KEY`, `VERIFF_SIGNATURE_KEY`,
   `VERIFF_BASE_URL`, `IDENTITY_VERIFICATION_ENABLED=false`.
2. Veriff dashboard → Live integration → Settings: set Webhook **events** URL
   and Webhook **decisions** URL to `https://www.specialcarers.com/api/m/webhooks/veriff`.
3. Veriff dashboard → Callback URL → `https://www.specialcarers.com/m/identity`.
4. Staging smoke test passes (flip flag to `true` on a preview deploy only).

## Deviations / notes for reviewer
- **Dashboard mount:** the repo has no separate family/carer dashboards — both
  render via `/m/home` (role-routed to `SeekerHomeClient` / `CarerHomeClient`).
  Mounted on BOTH, plus the dedicated `/m/identity` route. Card self-hides when
  the flag is off (same self-hiding pattern as `PredictiveSlotCard`).
- **Session route adapter test:** the `POST` handler reads cookies via
  `next/headers`, which can't run outside a request scope under `node:test`
  (same reason the Whereby room route has no route.test). Its logic is fully
  covered by `identity-handler.test.ts`; the route.test exercises the
  request-independent adapter (`buildIdentityClient`) end-to-end with a stubbed
  fetch. Webhook route has no cookie dep → tested directly (valid→200, bad→401).
- **TEST creds** (`VERIFF_TEST_*`) documented in `.env.example` but not consumed
  by code (env-aware switching is a deliberate follow-up, per spec).
- **getDecision** is implemented + tested but not yet wired into a route; the
  webhook is the source of truth for status. A reconcile/poll job can use it later.
