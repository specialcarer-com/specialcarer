/**
 * Phase 3 dry-run: April 2026 payroll preview.
 *
 * Invokes openPreview() with PAYROLL_DRY_RUN=true so no carer emails go
 * out, reads back draft payouts, then generates a BACS18 preview behind
 * FEATURE_BACS18_EXPORT_ENABLED. Idempotent.
 */

process.env.PAYROLL_DRY_RUN = "true";
process.env.FEATURE_BACS18_EXPORT_ENABLED = "true";
// Set server-only escape so importing server-only modules works
process.env.NEXT_PUBLIC_VERCEL_ENV ??= "development";
process.env.NODE_ENV ??= "development";

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import { createClient } from "@supabase/supabase-js";
import { openPreview } from "../src/lib/payroll/run-engine";
import { generateBacs18File } from "../src/lib/payroll/bacs18";
import { validateBacs18Input } from "../src/lib/payroll/bacs18-validate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: run, error: runErr } = await supabase
  .from("payroll_runs")
  .select("*")
  .eq("period_start", "2026-04-01")
  .eq("period_end", "2026-04-30")
  .maybeSingle();
if (runErr || !run) {
  console.error("No April 2026 payroll_run found");
  process.exit(1);
}

console.log(`\n=== DRY-RUN: April 2026 payroll ===`);
console.log(`run_id        : ${run.id}`);
console.log(`status (in)   : ${run.status}`);
console.log(`period        : ${run.period_start} → ${run.period_end}`);
console.log(`scheduled run : ${run.scheduled_run_date}`);
console.log(`preview opens : ${run.preview_opens_at}\n`);

await supabase
  .from("payroll_runs")
  .update({ status: "scheduled" })
  .eq("id", run.id);

console.log("[step 1/3] openPreview() …");
const out = await openPreview(supabase, run as never);
console.log(`           carers processed : ${out.carers}`);
console.log(`           errors           : ${out.errors.length}`);
for (const e of out.errors.slice(0, 3)) console.log(`           ─ ${e}`);

console.log("\n[step 2/3] Reading draft payouts …");
const { data: payouts } = await supabase
  .from("org_carer_payouts")
  .select(
    "id, carer_id, total_pay_cents, gross_pay_cents, paye_deducted_cents, ni_employee_cents, ni_employer_cents, holiday_accrued_cents, net_pay_cents, tax_code, status, payslip_pdf_url",
  )
  .eq("run_id", run.id);
const { data: profiles } = await supabase
  .from("profiles")
  .select("id, full_name");
const nameById = new Map(
  (profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]),
);

let tGross = 0, tPaye = 0, tNiEe = 0, tNiEr = 0, tHol = 0, tNet = 0;
console.log("");
console.log("Carer                       Gross    PAYE    NI(ee)  NI(er)  Hol.    Net     Status   Payslip");
console.log("─".repeat(96));
for (const p of payouts ?? []) {
  tGross += p.gross_pay_cents;
  tPaye += p.paye_deducted_cents;
  tNiEe += p.ni_employee_cents;
  tNiEr += p.ni_employer_cents;
  tHol += p.holiday_accrued_cents;
  tNet += p.net_pay_cents;
  const name = (nameById.get(p.carer_id) ?? p.carer_id.slice(0, 8)).padEnd(26);
  const f = (c: number) => `£${(c / 100).toFixed(2)}`.padStart(7);
  console.log(
    `${name}${f(p.gross_pay_cents)} ${f(p.paye_deducted_cents)} ${f(p.ni_employee_cents)} ${f(p.ni_employer_cents)} ${f(p.holiday_accrued_cents)} ${f(p.net_pay_cents)}  ${(p.status as string).padEnd(7)} ${p.payslip_pdf_url ? "yes" : "no"}`,
  );
}
console.log("─".repeat(96));
const f = (c: number) => `£${(c / 100).toFixed(2)}`.padStart(7);
console.log(`TOTALS                    ${f(tGross)} ${f(tPaye)} ${f(tNiEe)} ${f(tNiEr)} ${f(tHol)} ${f(tNet)}`);

console.log("\n[step 3/3] BACS18 export preview (FEATURE_BACS18_EXPORT_ENABLED=true) …");
const payments = (payouts ?? []).map((p) => ({
  payeeSortCode: "401234",
  payeeAccountNumber: "12345678",
  payeeName: (nameById.get(p.carer_id) ?? "TEST CARER")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 18),
  amountPence: p.net_pay_cents,
  reference: `SC${run.id.slice(0, 8).toUpperCase()}`,
  transactionCode: "99" as const,
}));

const input = {
  originator: {
    sortCode: process.env.BACS_ORIGINATOR_SORT_CODE ?? "200000",
    accountNumber: process.env.BACS_ORIGINATOR_ACCOUNT ?? "12345678",
    sun: process.env.BACS_ORIGINATOR_SUN ?? "123456",
    name: process.env.BACS_ORIGINATOR_NAME ?? "ALL CARE 4 U GROUP",
  },
  submission: {
    serialNumber: 1,
    processingDate: new Date(run.scheduled_run_date as string),
  },
  payments,
};

const valid = validateBacs18Input(input);
console.log(`           input valid: ${valid.ok}`);
if (!valid.ok) {
  console.log(`           errors    : ${valid.errors.join("; ")}`);
} else {
  const out = generateBacs18File(input);
  if (out.error) {
    console.log(`           SKIPPED   : ${out.error}`);
  } else {
    const arr = out.content.split("\r\n").filter(Boolean);
    console.log(`           bytes     : ${Buffer.byteLength(out.content, "utf8")}`);
    console.log(`           lines     : ${arr.length}`);
    console.log(`           warnings  : ${out.warnings.length}`);
    for (const w of out.warnings.slice(0, 3)) console.log(`           ─ ${w}`);
    console.log(`           HDR1 line : ${arr[0]?.slice(0, 90)}`);
    if (arr.length >= 4) console.log(`           first pmt : ${arr[3]?.slice(0, 90)}`);
  }
}

console.log("\n=== Dry-run complete (no emails sent, no funds moved) ===");
console.log(`\nAdmin preview UI : /admin/payroll/${run.id}`);
console.log(`Carer dispute UI : /dashboard/payouts/${run.id}`);
console.log(`Dispute window   : preview_opens_at → scheduled_run_date − 72h`);
console.log(`BACS export      : POST /api/admin/payroll/runs/${run.id}/bacs-export`);
