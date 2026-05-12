import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateBacs18File,
  bacsFilenameDate,
  type Bacs18Input,
  type Bacs18Payment,
} from "@/lib/payroll/bacs18";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/payroll/runs/[id]/bacs-export
 *
 * Produces a Bacs Standard 18 Direct Credit text file (CRLF, 106-char
 * lines) for the given payroll run. The body of the response IS the file
 * — Content-Disposition: attachment streams it as a download.
 *
 * Feature-flagged:
 *   - When FEATURE_BACS18_EXPORT_ENABLED !== "true" the route returns 404
 *     so it doesn't even leak the URL's existence in environments where
 *     BACS isn't yet wired (e.g. before Lloyds issues the SUN).
 *
 * Required env (only when the flag is on):
 *   BACS_ORIGINATOR_SUN          6-digit Service User Number
 *   BACS_ORIGINATOR_SORT_CODE    6-digit sort code of the operator account
 *   BACS_ORIGINATOR_ACCOUNT      8-digit account number
 *   BACS_ORIGINATOR_NAME         <=18 char originator name
 *
 * If any of those are missing the route returns 500 with a clear error
 * — the parent agent will fill them in once Lloyds issues the SUN.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // 1. Feature flag — 404 when off so the surface is invisible.
  if (process.env.FEATURE_BACS18_EXPORT_ENABLED !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 2. Admin auth via the JSON-safe helper.
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const adminUser = guard.admin;

  // 3. Originator config from env.
  const sun = (process.env.BACS_ORIGINATOR_SUN ?? "").trim();
  const sortCode = (process.env.BACS_ORIGINATOR_SORT_CODE ?? "").trim();
  const accountNumber = (process.env.BACS_ORIGINATOR_ACCOUNT ?? "").trim();
  const originatorName = (process.env.BACS_ORIGINATOR_NAME ?? "").trim();
  const missing: string[] = [];
  if (!sun) missing.push("BACS_ORIGINATOR_SUN");
  if (!sortCode) missing.push("BACS_ORIGINATOR_SORT_CODE");
  if (!accountNumber) missing.push("BACS_ORIGINATOR_ACCOUNT");
  if (!originatorName) missing.push("BACS_ORIGINATOR_NAME");
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "originator_config_missing",
        missing,
        hint: "Set these env vars after Lloyds issues the SUN.",
      },
      { status: 500 },
    );
  }

  // 4. Load run + confirmed payouts + carer profiles.
  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("payroll_runs")
    .select(
      "id, period_start, period_end, scheduled_run_date, status, bacs_serial_number",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      period_start: string;
      period_end: string;
      scheduled_run_date: string;
      status: string;
      bacs_serial_number: number | null;
    }>();
  if (!run) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (run.status !== "approved" && run.status !== "confirmed") {
    return NextResponse.json(
      {
        error: "run_not_approved",
        hint: "BACS export requires status='approved' or 'confirmed'.",
        current_status: run.status,
      },
      { status: 400 },
    );
  }

  const { data: payouts } = await admin
    .from("org_carer_payouts")
    .select("id, carer_id, net_pay_cents, status")
    .eq("run_id", id)
    .eq("status", "confirmed");

  if (!payouts || payouts.length === 0) {
    return NextResponse.json(
      {
        error: "no_confirmed_payouts",
        hint: "Run contains no payouts in 'confirmed' status — nothing to export.",
      },
      { status: 400 },
    );
  }

  const carerIds = Array.from(
    new Set(
      (payouts as { carer_id: string }[]).map((p) => p.carer_id),
    ),
  );
  const { data: profiles } = carerIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, sort_code, account_number")
        .in("id", carerIds)
    : { data: [] };
  const profById = new Map(
    (profiles ?? []).map((p) => [
      (p as { id: string }).id,
      p as {
        id: string;
        full_name: string | null;
        sort_code: string | null;
        account_number: string | null;
      },
    ]),
  );

  // 5. Map payouts → Bacs18Payment[].
  const periodCompact = run.period_start.replace(/-/g, "").slice(0, 6);
  const payments: Bacs18Payment[] = [];
  const skipped: { carer_id: string; reason: string }[] = [];
  for (const p of payouts as Array<{
    id: string;
    carer_id: string;
    net_pay_cents: number;
  }>) {
    const prof = profById.get(p.carer_id);
    const sort = (prof?.sort_code ?? "").replace(/[^0-9]/g, "");
    const acct = (prof?.account_number ?? "").replace(/[^0-9]/g, "");
    if (sort.length !== 6 || acct.length !== 8) {
      skipped.push({
        carer_id: p.carer_id,
        reason: `bad bank details (sort=${sort.length}d, account=${acct.length}d)`,
      });
      continue;
    }
    if (!Number.isInteger(p.net_pay_cents) || p.net_pay_cents <= 0) {
      skipped.push({
        carer_id: p.carer_id,
        reason: `net_pay_cents not a positive integer (${p.net_pay_cents})`,
      });
      continue;
    }
    payments.push({
      payeeSortCode: sort,
      payeeAccountNumber: acct,
      payeeName: (prof?.full_name ?? "").trim().toUpperCase().slice(0, 18) || "PAYEE",
      amountPence: p.net_pay_cents,
      reference: `SPC-${periodCompact}-${p.id.slice(0, 6)}`,
      transactionCode: "99",
    });
  }
  if (payments.length === 0) {
    return NextResponse.json(
      {
        error: "no_valid_payments",
        skipped,
        hint: "All payouts were skipped due to bad bank details.",
      },
      { status: 400 },
    );
  }

  // 6. Serial number — bump from current value (or start at 1).
  const nextSerial = (run.bacs_serial_number ?? 0) + 1;

  // 7. Build the file.
  const input: Bacs18Input = {
    originator: {
      sun,
      sortCode,
      accountNumber,
      name: originatorName,
    },
    submission: {
      serialNumber: nextSerial,
      processingDate: new Date(run.scheduled_run_date + "T00:00:00Z"),
      currencyCode: "GBP",
    },
    payments,
  };
  const result = generateBacs18File(input);
  if (result.error || !result.content) {
    return NextResponse.json(
      {
        error: "generate_failed",
        detail: result.error ?? "empty content",
        warnings: result.warnings,
        skipped,
      },
      { status: 422 },
    );
  }

  // 8. Stamp the run with the serial + generation time. Best-effort —
  // surface a warning rather than failing the download.
  try {
    await admin
      .from("payroll_runs")
      .update({
        bacs_export_generated_at: new Date().toISOString(),
        bacs_serial_number: nextSerial,
      })
      .eq("id", id);
  } catch (e) {
    console.error("[bacs-export] run stamp failed", e);
  }

  // 9. Audit log.
  await logAdminAction({
    admin: adminUser,
    action: "payroll.bacs18_export",
    targetType: "payroll_run",
    targetId: id,
    details: {
      payment_count: payments.length,
      skipped_count: skipped.length,
      serial: nextSerial,
      warnings: result.warnings,
    },
  });

  // 10. Send the file.
  const filename = `BACS${bacsFilenameDate(input.submission.processingDate)}-${id.slice(0, 8)}.txt`;
  return new Response(result.content, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // Surface skipped payouts + warnings in a custom header for the
      // operator's download UI to display.
      "x-bacs-warnings": result.warnings.join(" | "),
      "x-bacs-skipped-count": String(skipped.length),
      "x-bacs-payment-count": String(payments.length),
    },
  });
}
