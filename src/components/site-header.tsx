import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import SiteHeaderNav from "@/components/site-header-nav";
import SignInDropdown from "@/components/sign-in-dropdown";
import MobileMenu from "@/components/mobile-menu";

export default async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = profile?.role === "admin";
  }

  return (
    <header className="px-6 py-4 flex items-center justify-between bg-white">
      <Link href="/" className="flex items-center" aria-label="SpecialCarer — home">
        <Image
          src="/brand/logo.svg"
          alt="SpecialCarer"
          width={322}
          height={242}
          priority
          className="h-16 md:h-20 w-auto"
        />
      </Link>
      <SiteHeaderNav />
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link
            href="/admin"
            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-100 text-xs font-semibold uppercase tracking-wider hover:bg-amber-100"
          >
            Admin
          </Link>
        )}
        {user ? (
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
          >
            Dashboard
          </Link>
        ) : (
          <>
            {/* Sign in dropdown only on md+ — mobile users get sign-in inside the hamburger sheet */}
            <div className="hidden md:contents">
              <SignInDropdown />
            </div>
            <Link
              href="/find-care"
              className="px-3 sm:px-4 py-2 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
            >
              Find care
            </Link>
          </>
        )}
        <MobileMenu />
      </div>
    </header>
  );
}
