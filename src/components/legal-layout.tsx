import Link from "next/link";
import type { ReactNode } from "react";
import SiteFooter from "./site-footer";
import Image from "next/image";

/**
 * Shared layout for /privacy, /terms, /cookies.
 *
 * Renders:
 *   - Site header (compact)
 *   - Counsel-review banner ("v1 baseline, must be reviewed by qualified counsel")
 *   - Title + last-updated stamp
 *   - Sticky table of contents derived from {sections}
 *   - Body content (children)
 *   - Site footer
 */
export type LegalSection = { id: string; title: string };

export default function LegalLayout({
  title,
  updated,
  sections,
  children,
  jurisdictionNote,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
  children: ReactNode;
  jurisdictionNote?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="px-6 py-5 border-b border-slate-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-9 w-auto" priority />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-slate-600">
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/cookies" className="hover:text-slate-900">
              Cookies
            </Link>
            <Link href="/contact" className="hover:text-slate-900">
              Contact
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[220px_1fr] gap-10">
          <aside className="hidden lg:block">
            <nav className="sticky top-6 text-sm">
              <p className="text-slate-500 uppercase tracking-wide text-xs font-medium mb-3">
                On this page
              </p>
              <ul className="space-y-2">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-slate-600 hover:text-brand"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="max-w-3xl">
            <p className="text-sm text-slate-500">
              Last updated: {updated}
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
              {title}
            </h1>

            <div className="mt-5 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <p>
                <span className="font-semibold">Working draft.</span> This
                document is the launch baseline for SpecialCarer (operated by
                All Care 4 U Group Limited, company number 09428739). It is
                offered in good faith and follows current UK GDPR / Data
                Protection Act 2018 / California Consumer Privacy Act
                guidance, but it has not yet been reviewed by qualified legal
                counsel. We will publish a counsel-reviewed version before
                launch promotion. If you spot anything inaccurate, please
                email{" "}
                <a
                  className="underline"
                  href="mailto:legal@allcare4u.co.uk"
                >
                  legal@allcare4u.co.uk
                </a>
                .
              </p>
              {jurisdictionNote && (
                <p className="mt-2">{jurisdictionNote}</p>
              )}
            </div>

            <div className="mt-8 prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-10 prose-h3:text-lg prose-h3:font-semibold prose-a:text-brand prose-a:no-underline hover:prose-a:underline">
              {children}
            </div>

            <div className="mt-12 p-5 rounded-2xl bg-slate-50 text-sm text-slate-600">
              Questions about this page? Email{" "}
              <a
                className="text-brand"
                href="mailto:privacy@allcare4u.co.uk"
              >
                privacy@allcare4u.co.uk
              </a>{" "}
              or write to All Care 4 U Group Limited, 85 Great Portland
              Street, London, England, W1W 7LT.
            </div>
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
