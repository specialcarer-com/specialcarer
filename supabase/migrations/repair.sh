#!/usr/bin/env bash
# One-shot reconciliation script for the supabase_migrations.schema_migrations
# table on the production project.
#
# Background: between 27 and 28 May 2026 several migrations were applied
# manually via the Supabase management API while the auto-migration CI
# workflow was being built. The management API records each apply under
# its *applied-at* timestamp rather than the *repo filename* timestamp,
# which means `supabase migration list` shows mismatched versions even
# though the schema is correct.
#
# Running this script re-stamps the recorded versions so they match the
# repo filenames. It is safe to run multiple times — each repair call
# is idempotent against an already-correct row.
#
# Prereqs:
#   - supabase CLI installed (https://supabase.com/docs/guides/cli)
#   - SUPABASE_ACCESS_TOKEN exported (https://supabase.com/dashboard/account/tokens)
#   - You have run `supabase link --project-ref qupjaanyhnuvlexkwtpq` once
#
# Usage:
#   ./repair.sh

set -euo pipefail

PROJECT_REF="qupjaanyhnuvlexkwtpq"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set. Generate one at:"
  echo "  https://supabase.com/dashboard/account/tokens"
  exit 1
fi

echo "Repairing migration versions on project $PROJECT_REF..."

# Each invocation re-stamps a previously-applied management-API entry
# under its repo filename version. The `--status applied` flag tells
# the CLI "this migration has already run, just update the bookkeeping
# row".

# Format: supabase migration repair --status applied <repo-filename-version>

supabase migration repair --status applied 20260524000000  # chat_tables.sql
supabase migration repair --status applied 20260524000001  # notifications.sql (canonical 20260524 shape)
supabase migration repair --status applied 20260524000002  # push_tokens.sql
supabase migration repair --status applied 20260525000000  # chat_realtime_pub.sql
supabase migration repair --status applied 20260527000000  # chat_thread_pinning.sql
supabase migration repair --status applied 20260528074224  # chat_moderation.sql

echo ""
echo "Repair complete. Verify with:"
echo "  supabase migration list --linked"
echo ""
echo "If new migrations have shipped since this script was written, append"
echo "their versions to the list above and run again. Future migrations"
echo "applied via the CI workflow will be recorded correctly without needing"
echo "repair."
