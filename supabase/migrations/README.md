# Supabase migrations

Migrations in this folder are **automatically applied to the production
project** (`qupjaanyhnuvlexkwtpq`) on every merge to `main` by the
GitHub Actions workflow at
[`.github/workflows/supabase-migrations.yml`](../../.github/workflows/supabase-migrations.yml).

## Naming convention

```
YYYYMMDDhhmmss_descriptive_name.sql
```

Examples:

```
20260528073838_notifications_align.sql
20260528074224_chat_moderation.sql
```

The Supabase CLI orders migrations lexicographically, so the
timestamp prefix is the source of truth for ordering. Always use the
14-digit form (`YYYYMMDDhhmmss`) for new files — older migrations in
the repo use the shorter 8-digit form (`YYYYMMDD`) only because they
predate this convention.

## Idempotency is required

Every migration file **must be safe to re-run** against a database
that already has the change applied. This is non-negotiable: the CI
pipeline trusts `supabase db push` to be a no-op when there's nothing
new, and a hand-applied migration may already have landed by the time
the CI run executes.

Idempotency patterns to use:

- `create table if not exists ...`
- `create index if not exists ...`
- `alter table ... add column if not exists ...`
- `drop policy if exists "..." on ...` before recreating a policy
- DO blocks that check `information_schema` before doing destructive
  things like column renames or `set not null`. See
  `20260528073838_notifications_align.sql` for the pattern.

## How CI applies migrations

On every push to `main` that touches `supabase/migrations/**`:

1. `supabase/setup-cli@v1` installs the CLI
2. `supabase link --project-ref qupjaanyhnuvlexkwtpq`
3. `supabase db push --linked --include-all`

The workflow needs two repo secrets:

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD` | https://supabase.com/dashboard/project/qupjaanyhnuvlexkwtpq/settings/database |

Add them under **Settings → Secrets and variables → Actions**.

A concurrency group named `supabase-migrations-prod` prevents two
pushes from racing each other.

## When CI is down: applying by hand

If you must apply a migration without CI (e.g. during an incident),
use the Supabase CLI locally:

```bash
supabase link --project-ref qupjaanyhnuvlexkwtpq
supabase db push --linked
```

Then immediately run `repair.sh` to ensure the recorded migration
versions in the `supabase_migrations.schema_migrations` table line up
with the filename versions in the repo. See the script in this folder
for the exact commands.

## Drift recovery — 27-28 May 2026

A historical note: several migrations between 7 May and 28 May 2026
were applied by hand via the Supabase management API rather than via
this workflow (the workflow didn't exist yet). As a result, the
`supabase_migrations.schema_migrations` table records those entries
under their **applied-at** timestamps rather than the repo filename
timestamps. This is harmless for forward operation but means a fresh
`supabase migration list` may show some "remote-only" entries that
correspond to repo files with different prefixes. Specifically:

| Repo file | Recorded version |
|---|---|
| `20260524_chat_tables.sql` | `20260527201131` |
| `20260525_chat_realtime_pub.sql` | `20260527201144` |
| `20260527_chat_thread_pinning.sql` | `20260527201200` |
| `20260524_push_tokens.sql` | `20260528072551` |
| `20260528073838_notifications_align.sql` | `20260528073838` (matches) |
| `20260528074224_chat_moderation.sql` | `20260528124xxx` |

To rewrite history cleanly, run `repair.sh` once — it issues the
`supabase migration repair` commands that re-stamp each manual entry
under its repo filename version. This is one-shot cleanup; it is not
required for the workflow to function.

## Baseline migration — `20260617120000_baseline_schema.sql`

Three tables — `caregiver_profiles`, `reviews`, `background_checks` —
were created directly in the Supabase **dashboard** before this
migration folder existed. Later migrations `ALTER` them, index them and
add RLS policies, but no `CREATE TABLE` for them ever lived in the repo.
A fresh `supabase db reset` therefore failed (the ALTERs had no table to
target). The baseline file captures these **pre-migration-system tables**
so a from-scratch build matches production.

Rules going forward:

- **All schema changes must be numbered migrations** in this folder — no
  more dashboard edits. The baseline is the last out-of-band schema we
  intend to absorb.
- The baseline is **idempotent** (every statement `IF NOT EXISTS` /
  guarded), so it is a **no-op on prod** and safe to re-run.
- ⚠️ The baseline was authored **without access to a live `db dump`**, so
  some column types/defaults are best-effort and marked `UNVERIFIED` in
  the file header. Before relying on it as the source of truth, a
  maintainer with a Supabase PAT must run
  `supabase db dump --schema public` and reconcile. See
  `mobile_redesign/db_drift_report.md` for the full drift analysis,
  including the separate ~120-remote-vs-87-repo migration-ledger mismatch
  that currently keeps CI auto-apply disabled.
