/**
 * Public family-invite acceptance page.
 *
 * Flow:
 *   1. Visit /family/accept/<token>
 *   2. If not signed in → redirect to /login?next=/family/accept/<token>
 *   3. If signed in → call acceptFamilyInvite(token) on the server
 *   4. On success → redirect to /m/family
 *   5. On failure → render friendly error
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { acceptFamilyInvite } from "@/lib/family/server";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`/family/accept/${token}`);
    redirect(`/login?redirect=${next}`);
  }

  const result = await acceptFamilyInvite(token);

  if (result.ok) {
    redirect("/m/family?welcome=1");
  }

  return (
    <main className="min-h-[100dvh] bg-bg-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
          SpecialCarer
        </div>
        <h1 className="text-2xl font-bold text-heading mb-3">
          We couldn&apos;t accept this invite
        </h1>
        <p className="text-subhead leading-relaxed mb-6">{result.error}</p>
        <Link
          href="/m/home"
          className="inline-block bg-primary text-white font-semibold rounded-full px-6 py-3"
        >
          Go to home
        </Link>
      </div>
    </main>
  );
}
