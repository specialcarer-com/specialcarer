"use client";

/**
 * Marketing-site primary navigation (client island).
 *
 * Lives inside the server-rendered <SiteHeader/> so the auth-aware bits
 * (admin badge, signed-in CTA) stay on the server, while the Services
 * dropdown gets full client interactivity:
 *
 *   • Click to open / close (works on touch devices where hover doesn't exist)
 *   • Hover to open on desktop (no flicker on transit thanks to a small pad)
 *   • Esc key closes the menu
 *   • Outside-click closes the menu
 *   • Closes automatically on route change
 *   • aria-expanded / aria-haspopup for screen readers
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

export default function SiteHeaderNav() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
      <Link href="/how-it-works" className="hover:text-slate-900">
        How it works
      </Link>

      {/* Services dropdown — click + hover (desktop) / click only (touch) */}
      <div
        ref={wrapRef}
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="hover:text-slate-900 inline-flex items-center gap-1 py-1"
        >
          Services
          <svg
            className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute top-full left-0 pt-3 z-50"
          >
            <div className="bg-white rounded-xl border border-slate-100 shadow-lg p-2 w-60">
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                Type of care
              </p>
              {SERVICES_OF_CARE.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  {s.label}
                </Link>
              ))}
              <div className="my-2 border-t border-slate-100" />
              <p className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                How it&rsquo;s delivered
              </p>
              {CARE_FORMATS.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
        )}
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
      <Link href="/organisations" className="hover:text-slate-900">
        For organisations
      </Link>
      <Link href="/become-a-caregiver" className="hover:text-slate-900">
        For caregivers
      </Link>
      <Link href="/blog" className="hover:text-slate-900">
        Blog
      </Link>
    </nav>
  );
}
