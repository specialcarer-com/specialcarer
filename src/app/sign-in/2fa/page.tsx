import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TotpChallenge } from "@/components/security/TotpChallenge";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Two-factor authentication — SpecialCarer",
  robots: { index: false, follow: false },
};

export default async function SignInTwoFactorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#F4EFE6] flex flex-col">
      <header className="border-b border-[#0F1416]/10 bg-white">
        <div className="max-w-md mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link href="/" className="text-sm font-semibold text-[#039EA0]">
            SpecialCarer
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <TotpChallenge />
        </div>
      </main>
    </div>
  );
}
