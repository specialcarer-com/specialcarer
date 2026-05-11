import { logAdminAction, requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/payroll/runs/[id]/bacs-csv
 *
 * BACS-style CSV export for the finance team to upload to the bank. The
 * format here is a generic CSV — real BACS18 fixed-width files are
 * formatted by the bank's upload tool. Columns:
 *   carer_id,carer_name,sort_code,account_number,amount_pence,reference
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminUser = await requireAdmin();
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("payroll_runs")
    .select("id, period_start, period_end, scheduled_run_date")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      period_start: string;
      period_end: string;
      scheduled_run_date: string;
    }>();
  if (!run) return new Response("not_found", { status: 404 });

  const { data: payouts } = await admin
    .from("org_carer_payouts")
    .select("id, carer_id, net_pay_cents, status")
    .eq("run_id", id)
    .eq("status", "confirmed");

  const carerIds = (payouts ?? []).map(
    (p) => (p as { carer_id: string }).carer_id,
  );
  const { data: profiles } = carerIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, sort_code, account_number")
        .in("id", carerIds)
    : { data: [] };
  const byId = new Map(
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

  const header = "carer_id,carer_name,sort_code,account_number,amount_pence,reference\n";
  const rows = (payouts ?? [])
    .map((p) => {
      const pp = p as { id: string; carer_id: string; net_pay_cents: number };
      const prof = byId.get(pp.carer_id);
      const name = (prof?.full_name ?? "").replace(/[",\r\n]/g, " ").trim();
      const sort = (prof?.sort_code ?? "").replace(/[^0-9-]/g, "");
      const acct = (prof?.account_number ?? "").replace(/[^0-9]/g, "");
      const ref = `SPC-${run.period_start.replace(/-/g, "").slice(0, 6)}-${pp.id.slice(0, 6)}`;
      return `${pp.carer_id},"${name}",${sort},${acct},${pp.net_pay_cents},${ref}`;
    })
    .join("\n");

  await logAdminAction({
    admin: adminUser,
    action: "payroll.bacs_csv_download",
    targetType: "payroll_run",
    targetId: id,
    details: { rows: payouts?.length ?? 0 },
  });

  return new Response(header + rows + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bacs-${run.period_start}-${run.period_end}.csv"`,
    },
  });
}
