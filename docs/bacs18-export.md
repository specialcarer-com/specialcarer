# BACS Standard 18 Direct Credit export

Generates a Pay.UK Bacs Standard 18 Direct Credit file from a confirmed
monthly payroll run. The file is downloaded by the finance team and
uploaded to the Lloyds bureau portal (or sent via AccessPay) to settle
carer net pay.

## Status: gated off

The route at `POST /api/admin/payroll/runs/[id]/bacs-export` is **disabled
by default** and returns HTTP 404 in environments where
`FEATURE_BACS18_EXPORT_ENABLED` is not set to `true`. This is intentional —
we don't want to advertise a payment endpoint that can't actually file
with the bank.

Code paths gated by this flag:
- `src/app/api/admin/payroll/runs/[id]/bacs-export/route.ts`

Code paths NOT gated (safe to import & unit-test even with the flag off):
- `src/lib/payroll/bacs18.ts` — pure file generator
- `src/lib/payroll/bacs18-validate.ts` — pure input validator

## Required configuration (set after Lloyds issues the SUN)

| Env var | Format | Source |
|---------|--------|--------|
| `FEATURE_BACS18_EXPORT_ENABLED` | `"true"` (literal) | Set in Vercel once everything below is filled in. |
| `BACS_ORIGINATOR_SUN` | 6 digits | Lloyds Direct Credit application result. |
| `BACS_ORIGINATOR_SORT_CODE` | 6 digits, no hyphens | The operator's Lloyds business account sort code. |
| `BACS_ORIGINATOR_ACCOUNT` | 8 digits | The operator's Lloyds business account number. |
| `BACS_ORIGINATOR_NAME` | <=18 chars, BACS subset (uppercase) | Short legal name. We use `ALL CARE 4 U GROUP`. |

All four are read at request time. If any are missing while the flag is
on, the route returns `500` with `{ error: "originator_config_missing",
missing: [...] }` — the operator UI should surface that list.

## How to enable, end-to-end

1. **Apply** for a Service User Number with Lloyds Business under their
   Direct Credit scheme. One-time £150 setup. Documentation:
   <https://www.lloydsbank.com/business/payments/bacs-payments.html>.
2. **When the SUN is issued**, populate the four `BACS_ORIGINATOR_*` env
   vars in Vercel (`Production` + `Preview`).
3. **Penny test.** Before going live Lloyds requires a `£0.01`-only file
   to be uploaded. Workflow:
   - Pick (or seed) a payroll run with a single confirmed payout of
     `net_pay_cents = 1`.
   - Set `FEATURE_BACS18_EXPORT_ENABLED=true` and the four originator
     vars **only in a Preview deployment**, not Production.
   - From the admin UI's payroll run detail page (or directly via
     `POST /api/admin/payroll/runs/{id}/bacs-export`), download the file.
   - Upload to Lloyds bureau portal. Confirm:
     - Header records (VOL1/HDR1/UHL1) parse cleanly
     - The single payment record routes to a real carer's account
     - The £0.01 lands the next banking day
     - The contra row debits the operator account for £0.01
4. **If the penny test clears**, set `FEATURE_BACS18_EXPORT_ENABLED=true`
   in Production. Carer payouts can now flow.

## Rollback

`vercel env rm FEATURE_BACS18_EXPORT_ENABLED production` — the route flips
back to 404 the moment that deployment promotes. No data is lost; the
underlying `payroll_runs.bacs_export_generated_at` and
`bacs_serial_number` columns are write-only from this surface and don't
affect anything else.

## File format

- Uniform **106-char lines, CRLF-separated** per the build brief. This is
  technically the MPD record length under Standard 18; the spec
  recommends SPD (80/100 mixed). Both are accepted by Lloyds bureau
  software in practice but the **penny test will catch a line-length
  mismatch** before going live. If Lloyds rejects, the only change
  required is `BACS18_LINE_WIDTH` in `src/lib/payroll/bacs18.ts` plus
  removing the right-padding in the `lineOf()` helper.
- One record per type, in this order:
  `VOL1, HDR1, UHL1, [Type-99 * N], Contra (txn code 17), UTL1, EOF1, EOV1`.
- Amounts are in **pence**, right-justified, zero-padded.
- Names and references are upper-cased and sanitised to the BACS
  character set (`A-Z 0-9 space . - '` plus `/` on references). Anything
  outside is replaced with a space.
- Trailing CRLF after EOV1.

## Validation

`validateBacs18Input()` is run automatically by the generator and is also
exported for callers that want to surface per-field errors before
attempting to build a file. Checks:

- Sort codes are 6 digits (TODO: full Pay.UK / VocaLink modulus check —
  see comment in `src/lib/payroll/bacs18-validate.ts`).
- Account numbers are 8 digits.
- Names are <=18 chars, ASCII-only, BACS character subset.
- References are <=18 chars, BACS character subset.
- Amounts are positive integers under the £20m per-payment cap.
- Cumulative total stays under `Number.MAX_SAFE_INTEGER` pence.
- SUN is exactly 6 digits.

## Audit trail

Every successful export writes an `admin_audit_log` row with `action =
'payroll.bacs18_export'` and details: `payment_count`, `skipped_count`,
`serial`, and any non-fatal `warnings[]` produced by the generator.

The route also stamps `payroll_runs.bacs_export_generated_at` and bumps
`payroll_runs.bacs_serial_number`. Re-running the export increments the
serial — each file submitted to Lloyds is uniquely numbered.

## Tests

```
npx tsx src/lib/payroll/__tests__/bacs18.test.ts
```

Covers:
- Byte-for-byte snapshot of a 3-payment file
- 106-char line invariant
- Record count + ordering
- Contra amount = sum of payments
- UTL1 totals + counts
- Validator catches each error class
- Route returns 404 when the feature flag is off
