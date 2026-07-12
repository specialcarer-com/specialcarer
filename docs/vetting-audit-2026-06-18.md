# Vetting paths audit — references / certifications+skills / video / course

**Date:** 2026-06-18
**Branch:** `chore/vetting-audit-2026-06-18`
**Scope:** The 4 non-DBS vetting paths surfaced from `/m/profile/vetting`. DBS deliberately excluded (covered in #117).
**Method:** Static read of routes, pages, clients, the shared vetting library, migrations, and admin UIs. `tsc --noEmit` passes clean. No runtime DB access available in this environment, so "end-to-end functional" is a code-level verdict (every link in the chain exists and is wired), not a live click-through.

## TL;DR

| Path | Functional? | Critical gaps | Effort to fix |
|---|---|---|---|
| References | **Yes** | 0 | — (1 MAJOR data-correctness nit, ~15 min, deferred) |
| Certifications / Skills | **Yes** | 0 | — (1 MINOR validation nit, ~10 min, deferred) |
| Video interview | **Yes** | 0 | — |
| Onboarding course | **Yes** | 0 | — |

**Headline:** all four paths are wired end-to-end — carer entry page → submit/save API → DB table (migration present, RLS on) → status transitions → admin review UI → aggregation in `getVettingSummary()` → admin publish gate. **No CRITICAL breakage was found**, so this PR is **documentation-only**. No code fixes are shipped (per the "no scope creep / smallest possible fix only" rule). The non-critical nits are listed per-path and recommended for a separate follow-up PR.

### One architectural finding worth flagging (not a per-path bug)

There are **two parallel readiness systems**, and they are intentionally decoupled:

- `src/lib/care/profile.ts:computeReadiness()` — the **carer self-publish** checklist (`/api/caregiver/profile` PATCH, `/dashboard`, `/dashboard/profile`). It reads only profile fields + Stripe payouts + `background_checks`. **It does NOT read any of the 4 vetting paths.**
- `src/lib/vetting/server.ts:getVettingSummary()` → `is_fully_vetted` — the **admin publish** gate (`/api/admin/caregivers/[id]/publish`) and the source for both vetting hubs (`/dashboard/vetting`, `/m/profile/vetting`). This DOES read all 4 paths + DBS.

So for the brief's question 6 ("is this path read by `computeReadiness()`?") the answer is **no for all four paths** — but that is by design: vetting is enforced at the admin publish step (`getVettingSummary`), not the carer self-publish step. The gap to be aware of: a carer who satisfies `computeReadiness` can self-publish a profile *without* having completed any vetting, because the two systems don't talk to each other. Whether that's acceptable is a product decision; it is called out here as **[MAJOR — cross-cutting]** but is explicitly out of scope for this audit's fixes (it touches publish business logic outside the 4 paths).

---

## References

### Status: Yes — end-to-end functional

### Files
- Entry (mobile hub): `src/app/m/profile/vetting/page.tsx` → links to `/dashboard/vetting/references`
- Entry (page): `src/app/dashboard/vetting/references/page.tsx` + `ReferencesClient.tsx`
- Carer API: `src/app/api/carer/references/route.ts` (GET / POST / DELETE)
- Public submit API: `src/app/api/references/submit/route.ts` (no-auth, token-gated)
- Referee landing page: `src/app/r/[token]/page.tsx` + `RefereeForm.tsx`
- Admin API: `src/app/api/admin/vetting/references/route.ts` (verify / reject)
- Admin UI: `src/app/admin/trust-safety/references/page.tsx` + `RefRowActions.tsx`
- DB migration: `supabase/migrations/20260509011208_carer_vetting_v1.sql` → `public.carer_references`

### What works
- Carer adds up to `MAX_REFERENCES` (3) referees; POST validates name/email, enforces the cap, generates a unique token, and emails the referee via `sendEmail` + `renderReferenceInviteEmail`. Email failure is best-effort (logged, doesn't fail the request).
- Magic-link flow: referee opens `/r/{token}`, submits rating/recommend/comment. Public submit route validates the token, checks expiry (auto-flips to `expired`), records IP + user-agent, and transitions `invited → submitted`.
- Statuses: `invited → submitted → verified | rejected | expired` — all present in both the DB CHECK constraint and the code transitions.
- Admin verify/reject is wired (`RefRowActions` → `/api/admin/vetting/references`), with `router.refresh()` after.
- `getReferencesStatus()` reads the table; "complete" = ≥2 verified. Surfaced in both hubs and as a blocker in the admin publish route.
- RLS: owner-only `for all` policy on `carer_references`; public submit correctly uses the admin (service-role) client because the referee is unauthenticated.

### What's broken or missing
- [MAJOR] The admin route sets `verified_by` + `verified_at` on **both** verify and reject. On a rejection these fields are semantically wrong (the row was not "verified"), which pollutes the audit trail. Functionality is unaffected — the queue/filter logic keys off `status`, not these timestamps. Recommend a dedicated `rejected_at` / `reviewed_by` pair, mirroring how the interview table uses `reviewed_by`/`reviewed_at`.
- [MINOR] No automated tests for the token lifecycle (expiry, double-submit returns `already_submitted`, cap enforcement).
- [MINOR] No resend-invite action in either the carer or admin UI; a carer whose referee never received the email must delete (only possible while `invited`) and re-add.

### Recommended fix
None shipped (no critical breakage). For a follow-up PR: split reject metadata from verify metadata in `/api/admin/vetting/references/route.ts`; add a resend-invite action; add token-lifecycle tests.

---

## Certifications / Skills assessment

> The hub surfaces these as two separate steps ("Certifications" and "Skills assessment"). They are backed by two different tables and two different routes, audited together here.

### Status: Yes — end-to-end functional (both halves)

### Files
**Certifications**
- Entry: `src/app/dashboard/vetting/certifications/page.tsx` + `CertificationsClient.tsx`
- Carer API: `src/app/api/carer/certifications/route.ts` (GET / POST / DELETE)
- Admin API: `src/app/api/admin/vetting/certifications/route.ts`
- Admin UI: `src/app/admin/trust-safety/certifications/page.tsx` + `CertRowActions.tsx`
- DB: `carer_certifications` + private `certifications` storage bucket (migration `20260509011208_carer_vetting_v1.sql`)

**Skills**
- Entry: `src/app/dashboard/vetting/skills/page.tsx` + `SkillsQuizClient.tsx`
- API: `src/app/api/carer/skills-quiz/route.ts` (GET questions / POST submit)
- Question bank: `src/lib/vetting/quiz-bank.ts` (50 questions = 10 × 5 verticals, verified)
- DB: `carer_skills_attempts` (migration `20260509011208_carer_vetting_v1.sql`)

### What works
**Certifications**
- Carer uploads a PDF/image directly to the private `certifications` bucket (client-side, RLS-scoped to `${userId}/…`), then POSTs metadata. POST re-validates `file_path` starts with `${user.id}/` (defence in depth against a forged path), validates `cert_type` against the allowed set, enforces `MAX_CERTIFICATIONS` (20), and ISO-date-validates issued/expires.
- Statuses `pending → verified | rejected | expired` (DB CHECK + admin route). Admin verify/reject wired via `CertRowActions`.
- `getCertificationsCount()` aggregates verified/pending; "verified > 0" counts toward `is_fully_vetted` and is an admin-publish blocker.

**Skills**
- GET returns the bank stripped of `correctIndex`/`explanation` (no answer leakage) plus cooldown info and pass threshold.
- POST grades server-side against `quiz-bank.ts`, computes score, applies the 70% pass threshold and the 24h post-fail cooldown (returns 429), and inserts an attempt row (self-attested — no admin review needed for skills, which is correct; the quiz is auto-graded).
- `hasPassedAnyQuiz()` reads passed attempts; "passed at least one vertical" counts toward `is_fully_vetted` and is an admin-publish blocker.

### What's broken or missing
- [MINOR] Skills POST answer validation accepts any integer `0..99` (`n >= 0 && n < 100`) rather than `0..(options.length-1)`. An out-of-range index simply scores as wrong (no crash, no data corruption), so this is cosmetic robustness, not breakage.
- [MINOR] Certifications are never auto-expired against `expires_at`; the `expired` status exists in the schema but nothing transitions a verified cert to `expired` when its date passes. Needs a scheduled job (out of scope).
- [MINOR] No tests for either half (grading correctness, cooldown enforcement, cert cap / file-path guard).

### Recommended fix
None shipped. Follow-up PR: tighten the skills answer bound to `mod`/bank option count; add a cron/edge job to expire stale verified certs; add grading + cooldown tests.

---

## Video interview

### Status: Yes — end-to-end functional

### Files
- Entry: `src/app/dashboard/vetting/interview/page.tsx` + `InterviewClient.tsx`
- Carer API: `src/app/api/carer/interview/route.ts` (GET / POST upsert)
- Admin API: `src/app/api/admin/vetting/interviews/route.ts` (approve / reject + signed-URL GET)
- Admin UI: `src/app/admin/trust-safety/interviews/page.tsx` + `InterviewRowActions.tsx`
- DB: `carer_interview_submissions` + private `interview-videos` bucket (migration `20260509011208_carer_vetting_v1.sql`)

### External vendor / webhook?
**None.** Video is recorded **on-device** via the browser `MediaRecorder` API and uploaded straight to the private Supabase `interview-videos` bucket. There is no Whereby / Daily / ElevenLabs dependency and therefore no webhook to wire — the brief's question 7 is N/A for this implementation. (Note: a separate `interview_rooms` table exists from migration `20260615153600_interview_rooms_v1.sql` and `/api/m/interviews/[id]/room`, but that is a *live video room* feature unrelated to this async 3-prompt vetting flow; not part of this path.)

### What works
- Three prompts (`INTERVIEW_PROMPTS`), 60s each. Client records webm, previews locally, then uploads to `${userId}/prompt-${i}.webm` and POSTs the path.
- POST validates `prompt_index ∈ [0,3)`, enforces `video_path` starts with `${user.id}/`, bounds duration, and **upserts** on `(carer_id, prompt_index)` — a re-record resets status to `pending` and clears prior review fields, so admins always review the latest take. The DB `unique(carer_id, prompt_index)` backs the upsert.
- Statuses `pending → approved | rejected`. Admin approve/reject wired; admin GET mints a fresh 1h signed URL to stream the private video.
- `hasInterviewApproved()` counts **distinct approved prompt_index**; "all 3 approved" feeds `is_fully_vetted` and is an admin-publish blocker.
- RLS owner-only on both the table and the storage bucket folder.

### What's broken or missing
- [MINOR] No `video/webm` MIME enforcement server-side (the client hard-codes webm; a crafted request could store a non-video). Low risk — bucket is private and admin-only readable via signed URL.
- [MINOR] No tests (upsert reset-to-pending behaviour, distinct-prompt approval counting).

### Recommended fix
None shipped. Follow-up: optional server-side content-type allowlist on the path/extension; add upsert + approval-count tests.

---

## Onboarding course

### Status: Yes — end-to-end functional

### Files
- Entry: `src/app/dashboard/vetting/course/page.tsx` (module list) → `src/app/dashboard/vetting/course/[module]/page.tsx` + `CourseModuleClient.tsx`
- API: `src/app/api/carer/course/route.ts` (GET list+progress), `…/course/[module]/read/route.ts` (POST mark read), `…/course/[module]/check/route.ts` (POST knowledge check)
- Content: `src/lib/vetting/course-content.ts` (6 modules, verified)
- DB: `carer_course_progress` (composite PK `(carer_id, module_key)`, migration `20260509011208_carer_vetting_v1.sql`)

### What works
- Six modules (`COURSE_MODULE_KEYS`), each with body + a single knowledge-check question.
- `read` route upserts `read_at`; `check` route grades against `course-content.ts` and upserts `knowledge_check_correct` + `knowledge_check_attempted_at`. The two upserts touch disjoint columns on the same PK, so they compose correctly regardless of order — read-then-check and re-attempts both preserve the other column (supabase-js upsert only writes the listed columns in the ON CONFLICT SET clause).
- Client marks a module read on mount and submits the check on demand; wrong answers offer a retry (no cooldown, which is fine for a learning check).
- `hasCompletedCourse()` requires, for each of the 6 modules, `read_at` set AND `knowledge_check_correct === true`; "all 6 complete" feeds `is_fully_vetted` and is an admin-publish blocker. This is **self-attested** (auto-graded) — no admin review UI, which is the correct design for a knowledge course.

### What's broken or missing
- [MINOR] No tests (the read+check upsert composition is exactly the kind of thing a regression test should pin, since a future refactor to a single upsert could silently null a column).
- [MINOR] `check` route stores the latest attempt's correctness only; a carer who answers wrong then right ends `correct = true` (intended), but there's no attempt history/audit. Acceptable for a self-attested course.

### Recommended fix
None shipped. Follow-up: add a test asserting read-then-check and check-then-read both leave a fully-complete row.

---

## Tests — summary across all paths

There are **no automated tests for any of the 4 vetting paths**. The only nearby tests (`src/app/api/admin/training/courses/**`) cover a *separate* admin "training courses" system, not this carer vetting onboarding course. `tsc --noEmit` is green. This is a [MAJOR] coverage gap but not a functional break; recommended as a dedicated test-only follow-up PR.

## Recommended next steps for the blocking gaps (separate PRs)

1. **[MAJOR — cross-cutting]** Decide whether `computeReadiness()` (carer self-publish) should require vetting completion, or whether vetting should remain admin-publish-only. If the former, wire `getVettingSummary().is_fully_vetted` into `computeReadiness`. This touches publish business logic and was intentionally left out of this audit's scope.
2. **[MAJOR]** References admin route: stop stamping `verified_by`/`verified_at` on rejections; add proper reject metadata.
3. **[MAJOR]** Add a vetting test suite (token lifecycle, quiz grading + cooldown, interview upsert/approval counting, course read+check composition).
4. **[MINOR]** Skills answer-index bound; cert auto-expiry job; interview content-type allowlist; reference resend-invite.
