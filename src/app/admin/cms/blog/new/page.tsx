import { requireAdmin } from "@/lib/admin/auth";
import BlogEditor from "../BlogEditor";

export const dynamic = "force-dynamic";

export default async function NewBlogPostPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">New blog post</h1>
      <BlogEditor />
    </div>
  );
}
