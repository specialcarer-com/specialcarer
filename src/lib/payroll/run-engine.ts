/**
 * Core payroll engine — shared between the cron handler and the manual
 * admin-trigger route. Pure-ish: takes a Supabase admin client and a
 * payroll_run row, mutates DB state, and returns a summary.
 *
 * Two main entry points:
 *   - openPreview(run): compute draft payouts + PDFs, transition to preview_open
 *   - executeRun(run): finalise confirmed payouts, transition to completed
 *
 * Both are idempotent — re-running for the same run.id is safe because we
 * upsert org_carer_payouts on (carer_id, period_start).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computePay, taxPeriodForDate } from "./compute-pay";
import { taxYearForDate } from "./tax-constants";
import { renderPayslipPdf, type PayslipData } from "./render-payslip";
import { sendEmail } from "@/lib/email/smtp";
import { computeHolidayLedgerEntry } from "./holiday-pot";

export const EMPLOYER_NAME = "All Care 4 U Group Ltd";
const PAYSLIP_BUCKET = "payslips";

type PayrollRun = {
  id: string;
  period_start: string;
  period_end: string;
  scheduled_run_date: string;
  status: string;
};

type Booking = {
  id: string;
  caregiver_id: string;
  carer_pay_total_cents: number | null;
  hours: number | null;
  currency: string | null;
  shift_completed_at: string | null;
};

type CarerBatch = {
  carer_id: string;
  total_gross_cents: number;
  items: { booking_id: string; hours: number; pay_cents: number }[];
  currency: string;
};

async function ensureBucket(admin: SupabaseClient): Promise<void> {
  try {
    const { data } = await admin.storage.listBuckets();
    if (data?.some((b) => b.name === PAYSLIP_BUCKET)) return;
    await admin.storage.createBucket(PAYSLIP_BUCKET, { public: false });
  } catch (e) {
    console.warn("[payroll] ensureBucket failed (continuing)", e);
  }
}

async function loadBatches(
  admin: SupabaseClient,
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, CarerBatch>> {
  // Org bookings with approved Phase-1 timesheets in the period window.
  const { data: bookings, error } = await admin
    .from("bookings")
    .select(
      "id, caregiver_id, carer_pay_total_cents, hours, currency, shift_completed_at",
    )
    .eq("booking_source", "org")
    .eq("currency", "gbp")
    .in("status", ["completed", "invoiced"])
    .gte("shift_completed_at", `${periodStart}T00:00:00Z`)
    .lt("shift_completed_at", `${periodEnd}T00:00:00Z`)
    .limit(5000);

  if (error) throw new Error(error.message);

  const byCarer = new Map<string, CarerBatch>();
  for (const b of (bookings as Booking[] | null) ?? []) {
    const carerId = b.caregiver_id;
    const pay = b.carer_pay_total_cents;
    if (!carerId || !pay || pay <= 0) continue;
    const existing = byCarer.get(carerId);
    if (existing) {
      existing.total_gross_cents += pay;
      existing.items.push({
        booking_id: b.id,
        hours: Number(b.hours ?? 0),
        pay_cents: pay,
      });
    } else {
      byCarer.set(carerId, {
        carer_id: carerId,
        total_gross_cents: pay,
        items: [
          {
            booking_id: b.id,
            hours: Number(b.hours ?? 0),
            pay_cents: pay,
          },
        ],
        currency: b.currency ?? "gbp",
      });
    }
  }
  return byCarer;
}

async function getYtd(
  admin: SupabaseClient,
  carerId: string,
  taxYear: string,
): Promise<{ ytd_gross: number; ytd_paye: number; ytd_ni: number; ytd_net: number }> {
  const { data } = await admin
    .from("org_carer_payouts")
    .select("gross_pay_cents, paye_deducted_cents, ni_employee_cents, net_pay_cents")
    .eq("carer_id", carerId)
    .eq("tax_year", taxYear)
    .in("status", ["confirmed", "paid"]);
  let g = 0, p = 0, n = 0, nt = 0;
  for (const r of data ?? []) {
    g += (r as { gross_pay_cents: number | null }).gross_pay_cents ?? 0;
    p += (r as { paye_deducted_cents: number | null }).paye_deducted_cents ?? 0;
    n += (r as { ni_employee_cents: number | null }).ni_employee_cents ?? 0;
    nt += (r as { net_pay_cents: number | null }).net_pay_cents ?? 0;
  }
  return { ytd_gross: g, ytd_paye: p, ytd_ni: n, ytd_net: nt };
}

async function uploadPayslipPdf(
  admin: SupabaseClient,
  bytes: Uint8Array,
  carerId: string,
  runId: string,
  isDraft: boolean,
): Promise<string | null> {
  const path = `${carerId}/${runId}-${isDraft ? "draft" : "final"}.pdf`;
  const { error } = await admin.storage
    .from(PAYSLIP_BUCKET)
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) {
    console.error("[payroll] payslip upload failed", error);
    return null;
  }
  // Return the storage path — UI generates signed URLs on demand.
  return path;
}

function periodLabel(periodStart: string): string {
  const d = new Date(`${periodStart}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Compute draft payouts, upload draft payslip PDFs, mark run as preview_open,
 * and notify each carer.
 */
export async function openPreview(
  admin: SupabaseClient,
  run: PayrollRun,
): Promise<{ carers: number; errors: string[] }> {
  await ensureBucket(admin);

  const batches = await loadBatches(admin, run.period_start, run.period_end);
  const periodEndDate = new Date(`${run.period_end}T00:00:00Z`);
  const taxYear = taxYearForDate(periodEndDate);
  const taxPeriod = taxPeriodForDate(periodEndDate);
  const errors: string[] = [];

  for (const [carerId, batch] of batches) {
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, full_name, email, tax_code, ni_number")
        .eq("id", carerId)
        .maybeSingle<{
          id: string;
          full_name: string | null;
          email: string | null;
          tax_code: string | null;
          ni_number: string | null;
        }>();

      const ytd = await getYtd(admin, carerId, taxYear);
      const pay = computePay({
        gross_cents: batch.total_gross_cents,
        ytd_gross_cents: ytd.ytd_gross,
        ytd_paye_cents: ytd.ytd_paye,
        tax_year: taxYear,
        tax_code: profile?.tax_code ?? null,
        tax_period: taxPeriod,
      });

      // Upsert the draft payout row.
      const { data: payout, error: upErr } = await admin
        .from("org_carer_payouts")
        .upsert(
          {
            carer_id: carerId,
            period_start: run.period_start,
            period_end: run.period_end,
            booking_count: batch.items.length,
            total_pay_cents: batch.total_gross_cents,
            gross_pay_cents: pay.gross_cents,
            paye_deducted_cents: pay.paye_cents,
            ni_employee_cents: pay.ni_employee_cents,
            ni_employer_cents: pay.ni_employer_cents,
            holiday_accrued_cents: pay.holiday_accrued_cents,
            net_pay_cents: pay.net_cents,
            tax_year: taxYear,
            tax_code: pay.effective_tax_code,
            run_id: run.id,
            currency: batch.currency,
            status: "draft",
          },
          { onConflict: "carer_id,period_start" },
        )
        .select("id")
        .single();
      if (upErr || !payout) {
        errors.push(`${carerId}: ${upErr?.message ?? "no payout row"}`);
        continue;
      }

      // Items
      await admin.from("org_carer_payout_items").upsert(
        batch.items.map((it) => ({
          payout_id: payout.id,
          booking_id: it.booking_id,
          carer_pay_cents: it.pay_cents,
        })),
        { onConflict: "payout_id,booking_id" },
      );

      // Render and upload draft PDF
      const pdfData: PayslipData = {
        employer_name: EMPLOYER_NAME,
        employee_name: profile?.full_name ?? "Carer",
        employee_id: carerId.slice(0, 8),
        tax_code: pay.effective_tax_code,
        ni_number: profile?.ni_number ?? null,
        period_label: periodLabel(run.period_start),
        period_start: run.period_start,
        period_end: run.period_end,
        pay_date: run.scheduled_run_date,
        is_draft: true,
        gross_cents: pay.gross_cents,
        paye_cents: pay.paye_cents,
        ni_employee_cents: pay.ni_employee_cents,
        ni_employer_cents: pay.ni_employer_cents,
        holiday_accrued_cents: pay.holiday_accrued_cents,
        net_cents: pay.net_cents,
        ytd_gross_cents: ytd.ytd_gross,
        ytd_paye_cents: ytd.ytd_paye,
        ytd_ni_cents: ytd.ytd_ni,
        ytd_net_cents: ytd.ytd_net,
        items: batch.items,
      };
      const bytes = await renderPayslipPdf(pdfData);
      const path = await uploadPayslipPdf(admin, bytes, carerId, run.id, true);
      if (path) {
        await admin
          .from("org_carer_payouts")
          .update({ payslip_pdf_url: path })
          .eq("id", payout.id);
      }

      // Notify carer that their draft payslip is ready
      if (process.env.PAYROLL_DRY_RUN !== "true" && profile?.email) {
        await sendEmail({
          to: profile.email,
          subject: `Draft payslip ready for review — ${periodLabel(run.period_start)}`,
          html: previewEmailHtml(profile.full_name ?? "there", run, pay.net_cents),
          text: previewEmailText(profile.full_name ?? "there", run, pay.net_cents),
        });
      }
    } catch (e) {
      errors.push(`${carerId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await admin
    .from("payroll_runs")
    .update({
      status: "preview_open",
      carer_count: batches.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return { carers: batches.size, errors };
}

/**
 * Transition all non-disputed draft payouts to confirmed, generate final
 * payslip PDFs, upsert holiday pots, then write the BACS CSV and email
 * notifications. Mark run as completed.
 */
export async function executeRun(
  admin: SupabaseClient,
  run: PayrollRun,
): Promise<{ carers: number; total_gross: number; total_net: number; errors: string[] }> {
  await ensureBucket(admin);

  await admin
    .from("payroll_runs")
    .update({ status: "running", actual_run_started_at: new Date().toISOString() })
    .eq("id", run.id);

  // Pull all draft payouts for this run that AREN'T disputed.
  const { data: drafts, error } = await admin
    .from("org_carer_payouts")
    .select(
      "id, carer_id, period_start, period_end, gross_pay_cents, paye_deducted_cents, ni_employee_cents, ni_employer_cents, holiday_accrued_cents, net_pay_cents, tax_year, tax_code, currency, status, booking_count",
    )
    .eq("run_id", run.id)
    .in("status", ["draft"]);
  if (error) throw new Error(error.message);

  const errors: string[] = [];
  let totalGross = 0;
  let totalNet = 0;
  let totalPaye = 0;
  let totalNiEmployer = 0;
  let carerCount = 0;

  const periodEndDate = new Date(`${run.period_end}T00:00:00Z`);
  const taxYear = taxYearForDate(periodEndDate);

  for (const d of drafts ?? []) {
    const dd = d as {
      id: string;
      carer_id: string;
      gross_pay_cents: number;
      paye_deducted_cents: number;
      ni_employee_cents: number;
      ni_employer_cents: number;
      holiday_accrued_cents: number;
      net_pay_cents: number;
      tax_year: string;
      tax_code: string;
      booking_count: number;
    };
    try {
      // Confirm the payout
      await admin
        .from("org_carer_payouts")
        .update({ status: "confirmed" })
        .eq("id", dd.id);

      // Phase 4 stage 1: also write an 'accrued' entry to the holiday-pot
      // ledger. The legacy carer_holiday_pots upsert below continues to run
      // in parallel until stage 2 retires it. Idempotent via the partial
      // unique index holiday_pot_ledger_accrued_unique on org_carer_payout_id.
      const ledgerEntry = computeHolidayLedgerEntry({
        id: dd.id,
        carer_id: dd.carer_id,
        holiday_accrued_cents: dd.holiday_accrued_cents,
        run_id: run.id,
      });
      if (ledgerEntry) {
        const { error: ledgerErr } = await admin
          .from("holiday_pot_ledger")
          .insert(ledgerEntry);
        // 23505 = unique_violation — re-runs of executeRun are safe.
        if (ledgerErr && ledgerErr.code !== "23505") {
          console.error("[payroll] ledger insert failed", ledgerErr);
        }
      }

      // Upsert holiday pot
      const { data: existingPot } = await admin
        .from("carer_holiday_pots")
        .select("id, accrued_cents")
        .eq("carer_id", dd.carer_id)
        .eq("tax_year", dd.tax_year)
        .maybeSingle<{ id: string; accrued_cents: number }>();
      if (existingPot) {
        await admin
          .from("carer_holiday_pots")
          .update({
            accrued_cents:
              (existingPot.accrued_cents ?? 0) + dd.holiday_accrued_cents,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPot.id);
      } else {
        await admin.from("carer_holiday_pots").insert({
          carer_id: dd.carer_id,
          tax_year: dd.tax_year,
          accrued_cents: dd.holiday_accrued_cents,
        });
      }

      // Re-render final payslip
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, email, ni_number")
        .eq("id", dd.carer_id)
        .maybeSingle<{ full_name: string | null; email: string | null; ni_number: string | null }>();

      const ytd = await getYtd(admin, dd.carer_id, dd.tax_year);
      // Note: getYtd now includes confirmed (this period) — subtract our own row
      const ytdGrossBefore = Math.max(0, ytd.ytd_gross - dd.gross_pay_cents);
      const ytdPayeBefore = Math.max(0, ytd.ytd_paye - dd.paye_deducted_cents);
      const ytdNiBefore = Math.max(0, ytd.ytd_ni - dd.ni_employee_cents);
      const ytdNetBefore = Math.max(0, ytd.ytd_net - dd.net_pay_cents);

      const { data: items } = await admin
        .from("org_carer_payout_items")
        .select("booking_id, carer_pay_cents")
        .eq("payout_id", dd.id);

      const pdfData: PayslipData = {
        employer_name: EMPLOYER_NAME,
        employee_name: profile?.full_name ?? "Carer",
        employee_id: dd.carer_id.slice(0, 8),
        tax_code: dd.tax_code,
        ni_number: profile?.ni_number ?? null,
        period_label: periodLabel(run.period_start),
        period_start: run.period_start,
        period_end: run.period_end,
        pay_date: run.scheduled_run_date,
        is_draft: false,
        gross_cents: dd.gross_pay_cents,
        paye_cents: dd.paye_deducted_cents,
        ni_employee_cents: dd.ni_employee_cents,
        ni_employer_cents: dd.ni_employer_cents,
        holiday_accrued_cents: dd.holiday_accrued_cents,
        net_cents: dd.net_pay_cents,
        ytd_gross_cents: ytdGrossBefore,
        ytd_paye_cents: ytdPayeBefore,
        ytd_ni_cents: ytdNiBefore,
        ytd_net_cents: ytdNetBefore,
        items: (items ?? []).map(
          (it) => ({
            booking_id: (it as { booking_id: string }).booking_id,
            pay_cents: (it as { carer_pay_cents: number }).carer_pay_cents,
          }),
        ),
      };
      const bytes = await renderPayslipPdf(pdfData);
      const path = await uploadPayslipPdf(admin, bytes, dd.carer_id, run.id, false);
      if (path) {
        await admin
          .from("org_carer_payouts")
          .update({ payslip_pdf_url: path })
          .eq("id", dd.id);
      }

      // Notify carer
      if (process.env.PAYROLL_DRY_RUN !== "true" && profile?.email) {
        await sendEmail({
          to: profile.email,
          subject: `Your payslip is ready — ${periodLabel(run.period_start)}`,
          html: payslipReadyEmailHtml(profile.full_name ?? "there", dd.net_pay_cents),
          text: payslipReadyEmailText(profile.full_name ?? "there", dd.net_pay_cents),
        });
      }

      totalGross += dd.gross_pay_cents;
      totalNet += dd.net_pay_cents;
      totalPaye += dd.paye_deducted_cents;
      totalNiEmployer += dd.ni_employer_cents;
      carerCount++;
    } catch (e) {
      errors.push(`${dd.carer_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await admin
    .from("payroll_runs")
    .update({
      status: "completed",
      actual_run_completed_at: new Date().toISOString(),
      carer_count: carerCount,
      total_gross_cents: totalGross,
      total_net_cents: totalNet,
      total_paye_cents: totalPaye,
      total_ni_employer_cents: totalNiEmployer,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  // Suppress unused var warning when tax-year is only used internally.
  void taxYear;

  return { carers: carerCount, total_gross: totalGross, total_net: totalNet, errors };
}

/* ----------------------------- email bodies ----------------------------- */

const gbp = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);

function previewEmailHtml(name: string, run: PayrollRun, netCents: number): string {
  return `<!doctype html><html><body style="font-family:'Plus Jakarta Sans',sans-serif;color:#1f2937;">
  <h2 style="color:#0E7C7B;">Hi ${name},</h2>
  <p>Your draft payslip for ${periodLabel(run.period_start)} is ready for review.</p>
  <p>Net pay (pending review): <strong>${gbp(netCents)}</strong>.</p>
  <p>Please log in and check the details. Payroll runs on <strong>${run.scheduled_run_date}</strong>.</p>
  <p>If anything looks wrong — a missing shift, an incorrect rate — please flag a dispute now so we can investigate before the money moves.</p>
  <p><a href="https://specialcarer.com/dashboard/payslips" style="background:#0E7C7B;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;">View draft payslip</a></p>
  <p style="color:#6b7280;font-size:12px;">SpecialCarer · All Care 4 U Group Ltd</p>
  </body></html>`;
}

function previewEmailText(name: string, run: PayrollRun, netCents: number): string {
  return `Hi ${name},\n\nYour draft payslip for ${periodLabel(run.period_start)} is ready (net ${gbp(netCents)}). Payroll runs on ${run.scheduled_run_date}.\n\nReview it here: https://specialcarer.com/dashboard/payslips\n\nIf anything looks wrong, flag a dispute before the run.\n\nSpecialCarer · All Care 4 U Group Ltd`;
}

function payslipReadyEmailHtml(name: string, netCents: number): string {
  return `<!doctype html><html><body style="font-family:'Plus Jakarta Sans',sans-serif;color:#1f2937;">
  <h2 style="color:#0E7C7B;">Hi ${name},</h2>
  <p>Your payslip is ready and net pay of <strong>${gbp(netCents)}</strong> will be transferred to your bank shortly.</p>
  <p><a href="https://specialcarer.com/dashboard/payslips" style="background:#0E7C7B;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;">View payslip</a></p>
  <p style="color:#6b7280;font-size:12px;">SpecialCarer · All Care 4 U Group Ltd</p>
  </body></html>`;
}

function payslipReadyEmailText(name: string, netCents: number): string {
  return `Hi ${name},\n\nYour payslip is ready — net pay ${gbp(netCents)} will be transferred to your bank shortly.\n\nView it: https://specialcarer.com/dashboard/payslips\n\nSpecialCarer · All Care 4 U Group Ltd`;
}
