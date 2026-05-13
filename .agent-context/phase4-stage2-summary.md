# Phase 4 stage 2 — UK Holiday Pot Disbursement

## What changed

The monthly UK payroll engine now pays out approved holiday-leave requests
during a run. When `executeRun` finalises a draft payout it inserts a
`debited_paid_leave` ledger entry for each request that this payslip covers
and flips the request to `status='paid'` with `paid_at` and `paid_via_run_id`
set. The gross payout is folded into the carer's gross pay at preview time so
PAYE and NI compute on it correctly.

### Logic

1. `openPreview()` builds the union of carer ids: those with bookings this
   period AND those with approved+unpaid leave (so a carer who took the
   whole month off still gets a payslip).
2. For each carer it loads approved+unpaid `holiday_leave_requests` and the
   current `v_holiday_pot_balances.balance_cents`, then calls
   `computeHolidayDisbursementForCarer({ requests, balanceCents })`.
3. The helper sorts requests FIFO by `created_at` (with id-lex tiebreak),
   greedily pays each one that fits the remaining balance, and auto-rejects
   any that exceed remaining balance with reason
   `"Insufficient balance at payroll time"`. Never partially pays.
4. The engine applies the rejections immediately (`status='rejected'`,
   `admin_notes=…`, `decided_at`), then runs `computePay()` with
   `gross_cents = bookings + holiday_payout_cents` so PAYE/NI are correct.
5. The decision is snapshotted on the payout row via two new columns:
   `holiday_payout_cents` (integer) and `holiday_payout_request_ids` (uuid[]).
6. `executeRun()` reads the snapshot. For each request id it inserts a
   `debited_paid_leave` ledger row (negative amount_cents, negative hours,
   leave_request_id set) and updates the request to `paid`. The new partial
   unique index on `holiday_pot_ledger (leave_request_id)
   WHERE entry_type='debited_paid_leave'` makes double-paying impossible.

### Idempotency

- Re-running `executeRun` is safe: the unique index on
  `holiday_pot_ledger.leave_request_id` (for `debited_paid_leave`) rejects
  duplicate inserts with `23505` which the engine swallows. The leave
  request `paid_at` update is guarded with `.eq("status", "approved")` so
  it never overwrites a `cancelled`/`paid` row.
- The pure helper is deterministic: same inputs → identical decision,
  tested via the FIFO-on-reversed-input case.

## Files touched

| Path | Change |
| --- | --- |
| `supabase/migrations/20260516_holiday_pot_disbursement_v1.sql` | NEW — adds `org_carer_payouts.holiday_payout_cents` (int, default 0), `org_carer_payouts.holiday_payout_request_ids` (uuid[], default '{}'), and partial unique index `holiday_pot_ledger_debited_leave_request_unique` on `holiday_pot_ledger(leave_request_id) WHERE entry_type='debited_paid_leave'`. Strictly additive. |
| `src/lib/payroll/holiday-pot.ts` | Added `computeHolidayDisbursementForCarer({ requests, balanceCents })` pure helper + types. Kept `computeHolidayLedgerEntry` for stage-1 accruals. |
| `src/lib/payroll/__tests__/holiday-pot.test.ts` | Rewrote to `node:test` style, 15 tests covering: ledger accrual cases (5) and disbursement cases — empty, full-coverage, over-balance auto-reject, multi-request FIFO partial coverage, zero/negative amount handling, zero balance, negative balance, idempotency (reversed-input determinism), tiebreaker on id. |
| `src/lib/payroll/run-engine.ts` | `openPreview` now unions batches with leave-only carers, fetches disbursement decision, applies rejections, includes payout in gross before `computePay`, snapshots payout fields. `executeRun` inserts ledger debits per snapshotted request id and marks requests paid — idempotent via unique index. |
| `src/lib/payroll/render-payslip.ts` | Added optional `holiday_payout_cents` to `PayslipData` and renders an informational "  of which: holiday pot payout" line under gross when non-zero. |
| `src/app/admin/leave-requests/page.tsx` | Selects + displays `paid_at` / `paid_via_run_id`. Shows "Will be paid in next run" (teal) for `approved`+unpaid and "Paid via run XXXXXXXX" (slate, mono short id) for `paid`. |
| `src/app/dashboard/holiday-pot/page.tsx` | Same status hints on the carer-facing "Your requests" table. |

## Test results

- New tests pass: 15/15 in `holiday-pot.test.ts`.
- Full suite: `npm test` → 102/103 pass. The single failure
  (`grace-period-blast.test.ts` — `Error: Cannot find module 'server-only'`)
  is pre-existing and unrelated.
- Typecheck: `npx tsc --noEmit` clean.
- Lint: repo has no ESLint config initialised (`next lint` prompts to set
  up); pre-existing state — left untouched.

## Commit

- Branch: `main`
- Author: `SpecialCarer Bot <bot@specialcarer.com>`
- Commit SHA: see commit log (recorded after push)

## Manual steps for the parent agent

**The Supabase migration is NOT applied.** The parent must run:

```
mcp__supabase__apply_migration
  project_id = qupjaanyhnuvlexkwtpq
  name       = holiday_pot_disbursement_v1
  query      = <contents of supabase/migrations/20260516_holiday_pot_disbursement_v1.sql>
```

Nothing else needs to be done out-of-band — no env vars, no Vercel changes,
no TestFlight tag (server/web only).
