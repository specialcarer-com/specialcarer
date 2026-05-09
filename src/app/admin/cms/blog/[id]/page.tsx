import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import BlogEditor from "../BlogEditor";

export const dynamic = "force-dynamic";

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  hero_image_url: string | null;
  status: string;
  audience: string[];
  tags: string[];
};

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("cms_posts")
    .select(
      "id, slug, title, excerpt, body_md, hero_image_url, status, audience, tags",
    )
    .eq("id", id)
    .maybeSingle<Post>();
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Edit blog post</h1>
      <BlogEditor initial={data} />
    </div>
  );
}
