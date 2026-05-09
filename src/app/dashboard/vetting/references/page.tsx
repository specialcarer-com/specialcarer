import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReferencesClient from "./ReferencesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "References — SpecialCarer" };

type Row = {
  id: string;
  referee_name: string;
  referee_email: string;
  relationship: string | null;
  status: string;
  token_expires_at: string;
  rating: number | null;
  recommend: boolean | null;
  comment: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  created_at: string;
};

export default async function ReferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/vetting/references");

  const { data } = await supabase
    .from("carer_references")
    .select(
      "id, referee_name, referee_email, relationship, status, token_expires_at, rating, recommend, comment, submitted_at, verified_at, created_at",
    )
    .eq("carer_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">References</h1>
        <Link
          href="/dashboard/vetting"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to vetting
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        Add up to three referees who&rsquo;ve seen your care work — a manager,
        a colleague, or a long-term client. We&rsquo;ll email them a link they
        can use for 14 days.
      </p>
      <ReferencesClient initial={(data ?? []) as Row[]} />
    </div>
  );
}
