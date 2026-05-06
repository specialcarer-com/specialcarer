import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

/**
 * Marketing-site 404.
 *
 * Mirrors the mobile /m/not-found.tsx safety net: any broken or stale
 * link on the public site lands here with the standard SiteHeader and
 * SiteFooter, so users always have a way out (logo, nav, footer links)
 * instead of the unstyled Next.js default.
 */
export const metadata = {
  title: "Page not found · SpecialCarer",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <MarketingShell>
      <section className="px-6 py-24 text-center">
        <p className="text-[13px] font-semibold tracking-widest uppercase text-primary">
          404
        </p>
        <h1 className="mt-3 text-[36px] sm:text-[44px] font-extrabold text-heading leading-tight">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-4 max-w-xl mx-auto text-[15px] text-subheading leading-relaxed">
          The link may be out of date or the page may have moved. Try one of
          the links below — or head back to the home page.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center font-bold text-white bg-primary rounded-full px-6 py-3"
          >
            Back to home
          </Link>
          <Link
            href="/find-care"
            className="inline-flex items-center justify-center font-bold text-primary bg-white border border-primary rounded-full px-6 py-3"
          >
            Find care
          </Link>
        </div>

        <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] text-subheading">
          <li>
            <Link href="/how-it-works" className="hover:text-primary">
              How it works
            </Link>
          </li>
          <li>
            <Link href="/become-a-caregiver" className="hover:text-primary">
              Become a caregiver
            </Link>
          </li>
          <li>
            <Link href="/pricing" className="hover:text-primary">
              Pricing
            </Link>
          </li>
          <li>
            <Link href="/contact" className="hover:text-primary">
              Contact
            </Link>
          </li>
        </ul>
      </section>
    </MarketingShell>
  );
}
