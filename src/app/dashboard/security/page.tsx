import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SecuritySettings } from "@/components/security/SecuritySettings";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Security — SpecialCarer",
};

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/security");

  return (
    <div className="min-h-screen bg-[#F4EFE6]">
      <header className="border-b border-[#0F1416]/10 bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[#039EA0] hover:text-[#028688]"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-[#0F1416]">Account security</h1>
        <p className="mt-2 text-sm text-[#0F1416]/70 leading-relaxed">
          Manage two-factor authentication for your account. Authenticator apps such as
          1Password, Google Authenticator, Microsoft Authenticator, or Authy can be used.
        </p>
        <div className="mt-6">
          <SecuritySettings />
        </div>
      </main>
    </div>
  );
}
