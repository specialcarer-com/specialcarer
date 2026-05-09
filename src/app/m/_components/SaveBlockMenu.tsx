"use client";

/**
 * Kebab menu for save / block actions on a carer profile.
 * Optimistic UI — flips state immediately and calls the API in the
 * background. On failure the state is reverted.
 *
 * Block also unsaves the carer (the API does this server-side, but we
 * mirror it here so the UI stays consistent without a refetch).
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  caregiverId: string;
  initialSaved?: boolean;
  initialBlocked?: boolean;
};

async function call(method: "POST" | "DELETE", url: string, body: unknown) {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
}

export default function SaveBlockMenu({
  caregiverId,
  initialSaved = false,
  initialBlocked = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [blocked, setBlocked] = useState(initialBlocked);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener("mousedown", handler);
      return () => window.removeEventListener("mousedown", handler);
    }
  }, [open]);

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    setOpen(false);
    try {
      const res = await call(
        next ? "POST" : "DELETE",
        "/api/saved-caregivers",
        { caregiverId },
      );
      if (!res.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    }
  }

  async function toggleBlock() {
    const next = !blocked;
    setBlocked(next);
    if (next) setSaved(false); // server-side block also unsaves
    setOpen(false);
    try {
      const res = await call(
        next ? "POST" : "DELETE",
        "/api/blocked-caregivers",
        { caregiverId },
      );
      if (!res.ok) {
        setBlocked(!next);
        if (next) setSaved(initialSaved);
      }
    } catch {
      setBlocked(!next);
      if (next) setSaved(initialSaved);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Carer options"
        className="grid h-10 w-10 place-items-center rounded-full bg-muted sc-no-select"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
          className="text-heading"
        >
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <ul className="absolute right-0 top-12 z-30 min-w-[180px] rounded-card bg-white border border-line shadow-card overflow-hidden">
          <li>
            <button
              type="button"
              onClick={toggleSave}
              className="w-full text-left px-4 py-3 text-[14px] font-semibold text-heading hover:bg-muted"
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={toggleBlock}
              className="w-full text-left px-4 py-3 text-[14px] font-semibold text-[#C22] hover:bg-muted border-t border-line"
            >
              {blocked ? "Unblock" : "Block this carer"}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
