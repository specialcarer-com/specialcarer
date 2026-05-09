import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import BannerForm from "./BannerForm";

export const dynamic = "force-dynamic";

type Banner = {
  id: string;
  key: string;
  title: string;
  placement: string;
  active: boolean;
  audience: string[];
  updated_at: string;
};

export default async function CmsBannersList() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("cms_banners")
    .select(
      "id, key, title, placement, active, audience, updated_at",
    )
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as Banner[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">CMS · Banners</h1>

      <BannerForm />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Banners
        </h2>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No banners yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((b) => (
              <li
                key={b.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{b.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      {b.key} · {b.placement} ·{" "}
                      {b.audience.join(",") || "—"}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                      b.active
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {b.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <Link
                  href={`/admin/cms/banners/${b.id}`}
                  className="mt-2 inline-block text-xs font-semibold text-teal-700 hover:underline"
                >
                  Edit →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
