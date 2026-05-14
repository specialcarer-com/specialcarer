"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Small delay before closing on mouse-leave so the cursor can travel from the
// trigger to the menu without the dropdown vanishing mid-traverse.
const CLOSE_DELAY_MS = 180;

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
  const [isTouch, setIsTouch] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch devices don't have real hover. We detect this once on mount and
  // disable the hover-to-open behaviour so tap-to-toggle stays predictable.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    setIsTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

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

  // Clear any pending close timer on unmount.
  useEffect(() => () => cancelClose(), []);

  // Hover handlers are only active on devices with real hover (desktop).
  const hoverProps = isTouch
    ? {}
    : {
        onMouseEnter: () => {
          cancelClose();
          setOpen(true);
        },
        onMouseLeave: scheduleClose,
      };

  return (
    <div
      ref={wrapRef}
      className="relative inline-block"
      {...hoverProps}
      onFocus={() => {
        cancelClose();
        setOpen(true);
      }}
      onBlur={(e) => {
        // Only close when focus leaves the wrapper entirely.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          scheduleClose();
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-sm text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 py-2 px-1 -mx-1"
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
          // Right-aligned under the trigger. Width is 18rem (288px) on desktop
          // and clamped to 14rem (224px) on phones so it fits within the
          // viewport even on a 320px-wide device when the trigger sits near
          // the right edge of the header.
          className="absolute right-0 top-full w-56 sm:w-72 rounded-2xl bg-white border border-slate-200 shadow-lg py-2 z-50"
          style={{ marginTop: 0 }}
          onMouseEnter={isTouch ? undefined : cancelClose}
          onMouseLeave={isTouch ? undefined : scheduleClose}
        >
          {/* Invisible hover bridge that fills the gap between the trigger
              and the menu so the cursor never "leaves" the dropdown when
              moving from one to the other. */}
          <span
            aria-hidden
            className="absolute -top-3 left-0 right-0 h-3"
          />
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
