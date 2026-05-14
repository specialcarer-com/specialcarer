"use client";

/**
 * Mobile slide-in navigation sheet (md-).
 *
 * Mirrors the desktop <SiteHeaderNav/> links plus the Services sub-section so
 * phone/tablet visitors can reach every marketing page from the header. Hidden
 * at md and above where the inline nav takes over.
 *
 * Behaviour:
 *   • Hamburger trigger toggles the sheet
 *   • Sheet slides in from the right; backdrop dims the page
 *   • Esc key, backdrop click, or route change closes the sheet
 *   • Body scroll is locked while open
 *   • aria-expanded / aria-controls / aria-modal for screen readers
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const SERVICES_OF_CARE = [
  { href: "/services/elderly-care", label: "Elderly care" },
  { href: "/services/childcare", label: "Childcare" },
  { href: "/services/special-needs", label: "Special-needs care" },
  { href: "/services/postnatal", label: "Postnatal & newborn" },
  { href: "/services/complex-care", label: "Complex care" },
];

const CARE_FORMATS = [
  { href: "/care-formats/live-in", label: "Live-in care" },
  { href: "/care-formats/visiting", label: "Visiting care" },
];

const PRIMARY_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/trust", label: "Trust & safety" },
  { href: "/pricing", label: "Pricing" },
  { href: "/employers", label: "For employers" },
  { href: "/organisations", label: "For organisations" },
  { href: "/become-a-caregiver", label: "For caregivers" },
  { href: "/blog", label: "Blog" },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-nav-sheet"
        className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 hover:bg-slate-100"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 6h14M4 11h14M4 16h14" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="lg:hidden fixed inset-0 bg-slate-900/40 z-[60]"
          />

          {/* Sheet */}
          <div
            id="mobile-nav-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="lg:hidden fixed top-0 right-0 bottom-0 w-[86%] max-w-sm bg-white z-[70] shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-900">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:bg-slate-100"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 22 22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M5 5l12 12M17 5L5 17" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <Link
                href="/how-it-works"
                onClick={() => setOpen(false)}
                className="block px-3 py-3 rounded-lg text-base text-slate-800 hover:bg-slate-50"
              >
                How it works
              </Link>

              <div className="mt-3">
                <p className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                  Type of care
                </p>
                {SERVICES_OF_CARE.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 rounded-lg text-[15px] text-slate-700 hover:bg-slate-50"
                  >
                    {s.label}
                  </Link>
                ))}
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                  How it&rsquo;s delivered
                </p>
                {CARE_FORMATS.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 rounded-lg text-[15px] text-slate-700 hover:bg-slate-50"
                  >
                    {s.label}
                  </Link>
                ))}
              </div>

              <div className="my-3 border-t border-slate-100" />

              {PRIMARY_LINKS.filter((l) => l.href !== "/how-it-works").map(
                (l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-3 rounded-lg text-base text-slate-800 hover:bg-slate-50"
                  >
                    {l.label}
                  </Link>
                ),
              )}
            </nav>

            <div className="px-4 py-4 border-t border-slate-100 flex flex-col gap-2">
              <Link
                href="/find-care"
                onClick={() => setOpen(false)}
                className="block w-full text-center px-4 py-3 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
              >
                Find care
              </Link>
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-700">
                <Link
                  href="/login/caregiver"
                  onClick={() => setOpen(false)}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-center hover:bg-slate-50"
                >
                  Caregivers
                </Link>
                <Link
                  href="/login/family"
                  onClick={() => setOpen(false)}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-center hover:bg-slate-50"
                >
                  Families
                </Link>
                <Link
                  href="/login/organisation"
                  onClick={() => setOpen(false)}
                  className="px-2 py-2 rounded-lg border border-slate-200 text-center hover:bg-slate-50"
                >
                  Orgs
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
