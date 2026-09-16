# DSAR round-trip smoke test

Exact reproduction of the Phase F1 DSAR smoke test that was run against
prod on 15 September 2026 using `familytest@specialcarer.com`. Rerun
this after any change to the submit handler, the verify route, the
`dsar-fulfil` cron, or the `dsar-exports` storage bucket policies.

> **Feature flag**: `NEXT_PUBLIC_SELF_SERVICE_DATA_RIGHTS_ENABLED`
> stays **off** in prod until F1b passes end-to-end. The `/api/dsar/*`
> endpoints themselves are always live — the flag only gates the
> `/settings/data` UI. Backend smoke can run against a live prod
> deploy regardless of the flag.

## What this proves

- Anonymous submit (no auth session) → row created in `verifying`
- Verification email actually sends via Resend and arrives at the
  subject's mailbox
- Click of the verification link flips state → `in_progress`
- The `dsar-fulfil` cron picks up the row on its next tick, generates
  the export, uploads to `dsar-exports`, mints a 24-hour signed URL,
  emails the URL to the subject
- Row lands in `delivered` with `delivered_at` and
  `delivery_object_path` populated
- The signed URL downloads a JSON export matching the `SubjectExport`
  shape

## Prerequisites

- A dedicated test inbox you can access (e.g.
  `familytest@specialcarer.com`)
- An `auth.users` row exists for that email address. If not, sign up
  first through the normal flow — anonymous DSARs against emails
  with no matching auth user will hit the F1a
  `skipped_no_matching_user` branch instead of delivering.
- `curl`, mailbox access, Supabase dashboard access

## Cron cadence and batch size

- `/api/cron/dsar-fulfil` runs every 15 minutes at **:00, :15, :30,
  :45 UTC** (`vercel.json` → `*/15 * * * *`)
- `BATCH_LIMIT = 5` requests processed per tick (see
  `src/app/api/cron/dsar-fulfil/route.ts`)
- Worst case delivery latency after `in_progress` = ~15 min + export
  runtime (usually seconds)

## Step 1 — submit anonymously

```bash
curl -X POST https://specialcarer.com/api/dsar/submit \
  -H 'content-type: application/json' \
  --data '{"email":"familytest@specialcarer.com","type":"access"}'
```

Expected: HTTP 202, body `{"ok":true,"fast_path":false,"id":"<uuid>"}`.

If the response is 502 with `code:"verification_email_failed"`, the
Resend send failed and the row has already been marked
`state='failed'` with the reason in `verification_error`. Fix the
email transport (RESEND_API_KEY / EMAIL_FROM) before rerunning.

## Step 2 — verify the row landed

In Supabase SQL editor:

```sql
select id, state, subject_user_id, subject_email, verification_error,
       created_at
from public.dsar_requests
where subject_email = 'familytest@specialcarer.com'
order by created_at desc
limit 1;
```

Expected: `state='verifying'`, `verification_error IS NULL`,
`subject_user_id` may be NULL (that's fine — F1a resolves it at
cron time).

## Step 3 — click the verification link

Open the mailbox, click the "Confirm your SpecialCarer data request"
email's link. The `/api/dsar/verify/[token]` page should show
"Request confirmed" and the row's `state` should now be
`in_progress` with `verified_at` set.

## Step 4 — wait for the cron

Wait until the next `:00`/`:15`/`:30`/`:45` UTC boundary, plus ~30s
for the Vercel invocation to start.

## Step 5 — inspect the healthy log line

In Vercel logs (filter: `/api/cron/dsar-fulfil`), you should see:

```
[cron.dsar-fulfil] scanned 1, delivered 1, resolved 1, skipped_no_user 0, errors 0
```

Field meanings:

- `scanned` — rows read from the queue (bounded by BATCH_LIMIT=5)
- `delivered` — rows that reached `state=delivered` this tick
- `resolved` — rows where the F1a auth.users lookup successfully
  backfilled `subject_user_id` (0 if all rows arrived with the id
  already populated)
- `skipped_no_user` — rows with null `subject_user_id` AND no
  matching auth.users email; these need admin follow-up and will be
  scanned again on every tick until resolved or cancelled
- `errors` — any upload/sign/update/exception failures; details in
  the `results[]` array of the JSON response

## Step 6 — inspect the delivered state + storage object

```sql
select id, state, delivered_at, delivery_object_path
from public.dsar_requests
where id = '<uuid from step 1>';
```

Expected: `state='delivered'`, `delivered_at` recent,
`delivery_object_path = '<uuid>/subject-export.json'`.

In the Supabase Storage UI, navigate to the `dsar-exports` bucket
and confirm the object exists at that path.

Check the mailbox for the "Your SpecialCarer data export is ready"
email. The signed URL in the body is valid for 24 hours; click it
and confirm the download is a JSON document with the shape defined
in `src/lib/dsar/export.ts` → `SubjectExport`.

## Failure modes and where they show up

| Symptom | Look here |
|---|---|
| No log line at all after tick | Cron auth failing — `CRON_SECRET` env var? |
| `[cron.dsar-fulfil] scanned 0, ...` | Row never advanced past `verifying` — check step 3, or check `verification_error` in the row |
| `skipped_no_user 1` and never advances | Auth user does not exist for the subject email. Either create the account or resolve the row manually in admin |
| `errors 1` and details show `upload:...` | Storage bucket permissions / bucket missing — see migration `20260915170000_dsar_exports_bucket.sql` |
| `errors 1` and details show `sign:...` | Bucket exists but the service role can't sign — usually a bucket policy regression |

## Related

- `docs/dsar/observability.md` — cron log-line convention
- `src/app/api/cron/dsar-fulfil/fulfil-handler.ts` — the row-
  processing logic (unit-tested)
- `src/lib/dsar/submit-handler.ts` — the submit path (unit-tested)
- `supabase/migrations/20260915170000_dsar_exports_bucket.sql` —
  private storage bucket the export lands in
- `supabase/migrations/20260915235500_dsar_requests_verification_error.sql`
  — `verification_error` column + `failed` state used by the submit
  handler on bounced sends
