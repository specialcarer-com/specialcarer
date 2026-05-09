import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: string;
  published_at: string | null;
  updated_at: string;
};

export default async function CmsBlogList() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("cms_posts")
    .select("id, slug, title, status, published_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">CMS · Blog</h1>
        <Link
          href="/admin/cms/blog/new"
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold"
        >
          + New post
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No blog posts yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">Title</th>
                <th className="text-left px-4 py-2.5">Slug</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Updated</th>
                <th className="text-left px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {r.title}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {r.slug}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                        r.status === "published"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : r.status === "draft"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(r.updated_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/cms/blog/${r.id}`}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
