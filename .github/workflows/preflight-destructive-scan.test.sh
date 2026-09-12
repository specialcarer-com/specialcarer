#!/usr/bin/env bash
# ============================================================================
# Local test suite for the pre-flight destructive-migration gate.
#
# This is a plain bash script (no test framework, no dependencies) that
# feeds representative SQL blobs through the same detection logic used by
# the `preflight` job in .github/workflows/supabase-migrations.yml and
# asserts the expected pass/fail verdict for each.
#
# Run:   bash .github/workflows/preflight-destructive-scan.test.sh
# Exits 0 on success, 1 if any case fails.
#
# NOTE: This mirrors the logic in the workflow. When the workflow logic
# changes, update `scan_added_lines` here to match.
# ============================================================================

set -uo pipefail

# ────────────────────────────────────────────────────────────────────────────
# The scan function — a self-contained copy of the workflow's logic against
# a single blob of "added lines" text passed on stdin. Returns 0 (clean) or
# 1 (destructive detected). Prints detected labels to stdout.
# ────────────────────────────────────────────────────────────────────────────
scan_added_lines() {
  local input
  input="$(cat)"

  # strip_comments_and_strings equivalent
  local stripped
  stripped="$(printf '%s' "$input" | sed -E \
    -e "s/--.*$//" \
    -e "s/'([^']|'')*'/''/g")"

  local -a patterns=(
    'DROP TABLE~DROP[[:space:]]+TABLE'
    'DROP COLUMN~DROP[[:space:]]+COLUMN'
    'DROP INDEX~DROP[[:space:]]+INDEX'
    'DROP CONSTRAINT~DROP[[:space:]]+CONSTRAINT'
    'DROP SCHEMA~DROP[[:space:]]+SCHEMA'
    'DROP FUNCTION~DROP[[:space:]]+FUNCTION'
    'DROP TRIGGER~DROP[[:space:]]+TRIGGER'
    'DROP POLICY~DROP[[:space:]]+POLICY'
    'TRUNCATE~TRUNCATE'
    'ALTER TABLE ... DROP~ALTER[[:space:]]+TABLE[[:space:]]+\S+[[:space:]]+DROP'
  )

  local hit=0
  local detected=""
  local entry label regex matches
  for entry in "${patterns[@]}"; do
    label="${entry%%~*}"
    regex="${entry#*~}"
    matches=$(printf '%s\n' "$stripped" | grep -inE "$regex" || true)
    if [ -n "$matches" ]; then
      hit=1
      detected="${detected}${detected:+, }${label}"
    fi
  done

  # DELETE FROM without WHERE
  local delete_hits
  delete_hits=$(printf '%s\n' "$stripped" | awk '
    BEGIN { IGNORECASE = 1 }
    { lines[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        if (lines[i] ~ /DELETE[[:space:]]+FROM/) {
          block = lines[i]
          if (block !~ /;/) {
            for (j = i + 1; j <= NR && j <= i + 5; j++) {
              block = block " " lines[j]
              if (lines[j] ~ /;/) break
            }
          }
          if (block !~ /[[:space:]]WHERE[[:space:]]/ && block !~ /[[:space:]]WHERE$/) {
            printf("%d:%s\n", i, lines[i])
          }
        }
      }
    }
  ')
  if [ -n "$delete_hits" ]; then
    hit=1
    detected="${detected}${detected:+, }DELETE without WHERE"
  fi

  if [ "$hit" -eq 1 ]; then
    echo "DESTRUCTIVE: ${detected}"
    return 1
  fi
  echo "CLEAN"
  return 0
}

# ────────────────────────────────────────────────────────────────────────────
# Test harness
# ────────────────────────────────────────────────────────────────────────────
PASS=0
FAIL=0
FAILURES=()

assert_case() {
  local name="$1"
  local expected="$2"   # "pass" (clean) or "fail" (destructive)
  local sql="$3"

  local out rc
  out="$(printf '%s' "$sql" | scan_added_lines)"
  rc=$?

  local actual
  if [ "$rc" -eq 0 ]; then actual="pass"; else actual="fail"; fi

  if [ "$actual" = "$expected" ]; then
    printf 'ok    [%s] expected=%s actual=%s  (%s)\n' "$name" "$expected" "$actual" "$out"
    PASS=$((PASS + 1))
  else
    printf 'FAIL  [%s] expected=%s actual=%s  (%s)\n' "$name" "$expected" "$actual" "$out"
    printf '      input: %s\n' "$sql"
    FAIL=$((FAIL + 1))
    FAILURES+=("$name")
  fi
}

# ── Additive migrations should pass ─────────────────────────────────────────
assert_case "create-table-additive" "pass" \
  "create table if not exists public.foo (id uuid primary key, name text);"

assert_case "alter-table-add-column-additive" "pass" \
  "alter table public.foo add column carer_payout_hold_reason text;"

assert_case "create-index-additive" "pass" \
  "create index if not exists foo_name_idx on public.foo (name);"

assert_case "create-policy-additive" "pass" \
  "create policy foo_read on public.foo for select to authenticated using (true);"

# ── Destructive DDL should fail ─────────────────────────────────────────────
assert_case "drop-table" "fail" \
  "DROP TABLE public.foo;"

assert_case "drop-table-lowercase" "fail" \
  "drop table public.foo;"

assert_case "drop-column" "fail" \
  "ALTER TABLE public.foo DROP COLUMN bar;"

assert_case "drop-index" "fail" \
  "DROP INDEX foo_name_idx;"

assert_case "drop-constraint" "fail" \
  "ALTER TABLE public.foo DROP CONSTRAINT foo_pkey;"

assert_case "drop-schema" "fail" \
  "DROP SCHEMA ahj CASCADE;"

assert_case "drop-function" "fail" \
  "DROP FUNCTION public.claim_next_payout(uuid);"

assert_case "drop-trigger" "fail" \
  "DROP TRIGGER trg_bookings_audit ON public.bookings;"

assert_case "drop-policy" "fail" \
  "DROP POLICY foo_read ON public.foo;"

assert_case "alter-table-drop-generic" "fail" \
  "alter table public.foo drop constraint chk_state;"

# ── DELETE handling ─────────────────────────────────────────────────────────
assert_case "delete-no-where" "fail" \
  "DELETE FROM public.audit_log;"

assert_case "delete-with-where-inline" "pass" \
  "DELETE FROM public.audit_log WHERE id = 1;"

assert_case "delete-with-where-next-line" "pass" \
  "$(printf 'DELETE FROM public.audit_log\n  WHERE created_at < now() - interval %s30 days%s;' "'" "'")"

assert_case "delete-with-where-two-lines-down" "pass" \
  "$(printf 'DELETE FROM public.audit_log\n  -- purge old rows\n  WHERE created_at < now();')"

# ── TRUNCATE ────────────────────────────────────────────────────────────────
assert_case "truncate" "fail" \
  "TRUNCATE public.log;"

assert_case "truncate-cascade" "fail" \
  "TRUNCATE TABLE public.log CASCADE;"

# ── Comments and string literals should be tolerated ────────────────────────
assert_case "commented-drop-table" "pass" \
  "-- DROP TABLE public.foo;"

assert_case "commented-truncate-with-trailing-code" "pass" \
  "select 1; -- TRUNCATE public.log;"

assert_case "drop-table-inside-string-literal" "pass" \
  "COMMENT ON TABLE t IS 'you can DROP TABLE this if needed';"

assert_case "truncate-inside-string-literal" "pass" \
  "insert into audit (msg) values ('do not TRUNCATE this table');"

# ── Sanity: empty / whitespace-only input ───────────────────────────────────
assert_case "empty" "pass" ""
assert_case "whitespace-only" "pass" "   
   
"

# ────────────────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────"
echo "Passed: ${PASS}  Failed: ${FAIL}"
echo "──────────────────────────────────────────"
if [ "$FAIL" -gt 0 ]; then
  echo "Failing cases:"
  printf '  %s\n' "${FAILURES[@]}"
  exit 1
fi
exit 0
