"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ITEMS = [
  {
    label: "For caregivers",
    href: "/login/caregiver",
    sub: "Sign in to pick up shifts",
  },
  {
    label: "For families",
    href: "/login/family",
    sub: "Sign in to manage your care",
  },
  {
    label: "For organisations",
    href: "/login/organisation",
    sub: "Care home, council, NHS trust",
  },
] as const;

export default function SignInDropdown() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative hidden sm:inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-sm text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
      >
        Sign in
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white border border-slate-200 shadow-lg py-2 z-50"
        >
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              role="menuitem"
              href={it.href}
              className="block px-4 py-3 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              onClick={() => setOpen(false)}
            >
              <div className="text-sm font-medium text-slate-900">
                {it.label}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{it.sub}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
