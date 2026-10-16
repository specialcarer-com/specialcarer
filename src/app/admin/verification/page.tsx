import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { KINDS, type KindKey } from "@/lib/verification/kinds";

export const dynamic = "force-dynamic";
export const metadata = { title: "Carer verification — Admin" };

export default async function AdminVerificationQueue() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: subs, error } = await admin
    .from("verification_submissions")
    .select("id, user_id, kind, created_at")
    .eq("status", "submitted")
    .order("created_at", { ascending: true })
    .limit(300);

  const list = subs ?? [];
  const ids = Array.from(new Set(list.map((s) => s.user_id)));
  const { data: people } = ids.length
    ? await admin.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Carer verification</h1>
      <p className="text-sm text-slate-600">
        Evidence carers have sent for review, oldest first. Open an item, do the check, tick the checklist and record
        your decision.
      </p>
      {error && <p className="text-sm text-rose-700">Could not load the queue: {error.message}</p>}
      {list.length === 0 && !error ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Nothing waiting for review.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {list.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/verification/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <span>
                  <span className="font-medium text-slate-900">{nameById.get(s.user_id) ?? "Unknown carer"}</span>
                  <span className="ml-2 text-sm text-slate-600">{KINDS[s.kind as KindKey]?.label ?? s.kind}</span>
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(s.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
