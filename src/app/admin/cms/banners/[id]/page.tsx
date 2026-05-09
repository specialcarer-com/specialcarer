import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import BannerForm from "../BannerForm";

export const dynamic = "force-dynamic";

type Banner = {
  id: string;
  key: string;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  audience: string[];
  placement: string;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  dismissible: boolean;
};

export default async function EditBanner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("cms_banners")
    .select(
      "id, key, title, body, cta_label, cta_href, audience, placement, starts_at, ends_at, active, dismissible",
    )
    .eq("id", id)
    .maybeSingle<Banner>();
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Edit banner</h1>
      <BannerForm initial={data} inline />
    </div>
  );
}
