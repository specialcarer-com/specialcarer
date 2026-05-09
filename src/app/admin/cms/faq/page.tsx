import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import FaqRow from "./FaqRow";
import NewFaqForm from "./NewFaqForm";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  category: string;
  question: string;
  answer_md: string;
  sort_order: number;
  audience: string[];
  status: string;
  updated_at: string;
};

export default async function CmsFaqList() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("cms_faqs")
    .select(
      "id, category, question, answer_md, sort_order, audience, status, updated_at",
    )
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  const rows = (data ?? []) as Row[];

  // Group by category for display.
  const byCat = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r);
    byCat.set(r.category, arr);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">CMS · FAQ</h1>
      <NewFaqForm />

      {byCat.size === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No FAQs yet.
        </div>
      ) : (
        Array.from(byCat.entries()).map(([cat, arr]) => (
          <section key={cat}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
              {cat} ({arr.length})
            </h2>
            <ul className="space-y-2">
              {arr.map((r) => (
                <li
                  key={r.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {r.question}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Sort {r.sort_order} · {r.status} ·{" "}
                        {r.audience.join(", ") || "—"}
                      </p>
                      <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap line-clamp-3">
                        {r.answer_md}
                      </p>
                    </div>
                  </div>
                  <FaqRow id={r.id} initial={r} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
