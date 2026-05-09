import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isVerifiedCarer } from "@/lib/community/auth";
import NewThreadForm from "./NewThreadForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New thread — SpecialCarer" };

export default async function NewThreadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/community/new");
  const ok = await isVerifiedCarer(supabase, user.id);

  if (!ok) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">New thread</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Only verified carers can post in the community. Complete vetting to
          unlock posting.
        </div>
        <Link
          href="/dashboard/vetting"
          className="inline-block px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
        >
          Open vetting →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">New thread</h1>
        <Link
          href="/dashboard/community"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Community
        </Link>
      </div>
      <NewThreadForm />
    </div>
  );
}
