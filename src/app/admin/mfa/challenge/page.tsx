import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TotpChallenge } from "@/components/security/TotpChallenge";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin two-factor authentication — SpecialCarer",
  robots: { index: false, follow: false },
};

export default async function AdminMfaChallengePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    redirect("/dashboard?forbidden=1");
  }

  return (
    <div className="min-h-screen bg-[#F4EFE6] flex flex-col">
      <header className="border-b border-[#0F1416]/10 bg-white">
        <div className="max-w-md mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="SpecialCarer">
            <Image src="/brand/logo.svg" alt="" width={120} height={40} className="h-7 w-auto" />
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#039EA0]">
            Admin
          </span>
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <TotpChallenge defaultNext="/admin/countries" />
          <p className="text-xs text-[#0F1416]/60 text-center leading-relaxed">
            Lost your authenticator device? Contact support for identity verification and
            factor reset.
          </p>
        </div>
      </main>
    </div>
  );
}
