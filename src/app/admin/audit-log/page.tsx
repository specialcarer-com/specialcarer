import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type AuditRow = {
  id: string;
  admin_id: string;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminAuditLog({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const admin = createAdminClient();
  const { data, count } = await admin
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = (data ?? []) as AuditRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every admin write action is recorded here. Records are immutable.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No admin actions recorded yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">When</th>
                <th className="text-left px-4 py-3 font-medium">Admin</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Target</th>
                <th className="text-left px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const reason =
                  (r.details as { reason?: unknown } | null)?.reason ?? null;
                const override =
                  (r.details as { override?: unknown } | null)?.override ===
                  true;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {r.admin_email ?? r.admin_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                        {r.action}
                      </code>
                      {override && (
                        <span className="ml-2 inline-block text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Override
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.target_type && (
                        <div className="font-medium text-slate-700">
                          {r.target_type}
                        </div>
                      )}
                      {r.target_id && (
                        <div className="font-mono text-[11px] text-slate-500 break-all">
                          {r.target_id}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-md">
                      {typeof reason === "string" && reason && (
                        <div className="mb-1">
                          <span className="text-slate-400">Reason: </span>
                          {reason}
                        </div>
                      )}
                      {r.details && Object.keys(r.details).length > 0 && (
                        <details className="text-[11px]">
                          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                            View JSON
                          </summary>
                          <pre className="mt-2 p-2 bg-slate-50 border border-slate-100 rounded overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(r.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {page} of {totalPages} · {count ?? 0} total
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/admin/audit-log?page=${page - 1}`}
                className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                ← Newer
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/admin/audit-log?page=${page + 1}`}
                className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                Older →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
