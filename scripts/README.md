## DSAR erase smoke drivers

Two in-process smokes for the DSAR erasure handler. Neither touches
Supabase or the network — they inject a fake ErasureAdminClient into
`handleDsarErase()` and assert on the observable outputs.

Run:
  npx tsx scripts/smoke-dsar-erase.ts
  npx tsx scripts/smoke-dsar-erase-failure-modes.ts

- `smoke-dsar-erase.ts` — happy path: plants a fake seeker+carer+booking,
  runs the erasure, asserts nulled columns, retained-column values,
  retention dates (care 6y, HMRC year+6 EOY), state flip, and digest
  determinism across two identical runs.

- `smoke-dsar-erase-failure-modes.ts` — two production risk paths:
    1. schema_not_ready — a manifest table is missing; handler continues,
       records `skip` rows with `reason=schema_not_ready`, does not throw.
    2. audit persist failure — the audit insert errors; handler surfaces
       `audit_persist_error` but does NOT reverse the row-level nulling.

Neither script is wired into CI. They're intended for on-demand runs
after handler / manifest changes.
