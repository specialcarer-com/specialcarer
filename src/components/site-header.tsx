import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

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
    <header className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-white">
      <Link href="/" className="flex items-center" aria-label="SpecialCarer — home">
        <Image
          src="/brand/logo.svg"
          alt="SpecialCarer"
          width={322}
          height={202}
          priority
          className="h-14 md:h-16 w-auto"
        />
      </Link>
      <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
        <Link href="/how-it-works" className="hover:text-slate-900">
          How it works
        </Link>
        <div className="relative group">
          <button className="hover:text-slate-900 inline-flex items-center gap-1">
            Services
            <svg
              className="w-3 h-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </button>
          <div className="absolute top-full left-0 pt-3 hidden group-hover:block">
            <div className="bg-white rounded-xl border border-slate-100 shadow-lg p-2 w-56">
              <Link
                href="/services/elderly-care"
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                Elderly care
              </Link>
              <Link
                href="/services/childcare"
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                Childcare
              </Link>
              <Link
                href="/services/special-needs"
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                Special-needs care
              </Link>
              <Link
                href="/services/postnatal"
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                Postnatal &amp; newborn
              </Link>
            </div>
          </div>
        </div>
        <Link href="/trust" className="hover:text-slate-900">
          Trust &amp; safety
        </Link>
        <Link href="/pricing" className="hover:text-slate-900">
          Pricing
        </Link>
        <Link href="/employers" className="hover:text-slate-900">
          For employers
        </Link>
        <Link href="/become-a-caregiver" className="hover:text-slate-900">
          For caregivers
        </Link>
        <Link href="/blog" className="hover:text-slate-900">
          Blog
        </Link>
      </nav>
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
            <Link
              href="/login"
              className="text-sm text-slate-700 hover:text-slate-900 hidden sm:inline"
            >
              Sign in
            </Link>
            <Link
              href="/find-care"
              className="px-4 py-2 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
            >
              Find care
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
