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

// Top-level marketing nav items in display order, used both for rendering and
// for matching the current pathname to highlight the active section.
const TOP_LEVEL: { href: string; label: string }[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/trust", label: "Trust & safety" },
  { href: "/pricing", label: "Pricing" },
  { href: "/employers", label: "For employers" },
  { href: "/organisations", label: "For organisations" },
  { href: "/become-a-caregiver", label: "For caregivers" },
  { href: "/blog", label: "Blog" },
];

// Treat a nav item as active if the current path matches it exactly or sits
// under it as a sub-route (e.g. /blog/post-slug under /blog).
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export default function SiteHeaderNav() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const servicesActive =
    pathname?.startsWith("/services/") || pathname?.startsWith("/care-formats/") || false;

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
    <nav className="hidden lg:flex items-center gap-6 text-sm text-slate-600">
      {/* How it works (no sub-menu) */}
      <Link
        href="/how-it-works"
        aria-current={isActive(pathname, "/how-it-works") ? "page" : undefined}
        className={`relative hover:text-slate-900 py-1 ${
          isActive(pathname, "/how-it-works")
            ? "text-slate-900 font-semibold after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-[2px] after:bg-brand after:rounded-full"
            : ""
        }`}
      >
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
          aria-current={servicesActive ? "page" : undefined}
          className={`relative hover:text-slate-900 inline-flex items-center gap-1 py-1 ${
            servicesActive
              ? "text-slate-900 font-semibold after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-[2px] after:bg-brand after:rounded-full"
              : ""
          }`}
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

      {/* Remaining top-level links, with active-state highlight */}
      {TOP_LEVEL.filter((i) => i.href !== "/how-it-works").map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative hover:text-slate-900 py-1 ${
              active
                ? "text-slate-900 font-semibold after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-[2px] after:bg-brand after:rounded-full"
                : ""
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
