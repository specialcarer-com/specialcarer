import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPublished } from "@/lib/admin/training-validation";

export const dynamic = "force-dynamic";

const BRAND_TEAL = "#0E7C7B";
const BRAND_ACCENT = "#F4A261";

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  required_for_verticals: string[];
  sort_order: number;
  published_at: string | null;
  created_at: string;
};

export default async function AdminTrainingListPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: courses } = await admin
    .from("training_courses")
    .select(
      "id, slug, title, category, required_for_verticals, sort_order, published_at, created_at",
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (courses ?? []) as CourseRow[];

  let counts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: qrows } = await admin
      .from("training_quiz_questions")
      .select("course_id")
      .in(
        "course_id",
        rows.map((r) => r.id),
      );
    for (const q of (qrows ?? []) as { course_id: string }[]) {
      counts.set(q.course_id, (counts.get(q.course_id) ?? 0) + 1);
    }
  }

  return (
    <div
      className="space-y-6"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Training courses
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage the continuing-education courses on the Training Hub. Drafts
            are hidden from carers until you publish.
          </p>
        </div>
        <Link
          href="/admin/training/new"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-95"
          style={{ backgroundColor: BRAND_TEAL }}
        >
          <span>+ Add new course</span>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Slug</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Required for</th>
              <th className="text-right px-4 py-3">Q&apos;s</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No courses yet. Click <strong>Add new course</strong> to
                  create the first one.
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const published = isPublished(c.published_at);
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {c.title}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                      {c.slug}
                    </td>
                    <td className="px-4 py-3">
                      {published ? (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: BRAND_TEAL }}
                        >
                          Published
                        </span>
                      ) : (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: BRAND_ACCENT }}
                        >
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 capitalize">
                      {c.category}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {c.required_for_verticals.length === 0
                        ? "—"
                        : c.required_for_verticals.join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {counts.get(c.id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/training/${c.id}/edit`}
                        className="text-sm font-medium hover:underline"
                        style={{ color: BRAND_TEAL }}
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
