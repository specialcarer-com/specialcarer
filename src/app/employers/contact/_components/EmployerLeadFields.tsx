"use client";

import { useState } from "react";
import { isFreeWebmail } from "@/lib/anti-spam/validate-lead";

/**
 * Client-side additions for the /employers/contact form. Kept as small,
 * self-contained client components so the parent page can stay a server
 * component and the plain HTML form (`method="post" action="/api/employers/lead"`)
 * keeps working exactly as before — these just render extra inputs with
 * the right `name` attributes.
 */

/** Honeypot input — real users never see or fill this in. */
export function EmployerHoneypotField() {
  const [value, setValue] = useState("");
  return (
    <input
      type="text"
      name="website"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "-9999px",
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Work-email field with a soft "use your work email" tip on free
 * webmail addresses. The server enforces the hard block on submit —
 * see /api/employers/lead — this is purely a UX nudge.
 */
export function WorkEmailField() {
  const [email, setEmail] = useState("");
  const free = email.length > 0 && isFreeWebmail(email);
  return (
    <label className="text-sm">
      <span className="text-slate-700 font-medium">Work email *</span>
      <input
        type="email"
        name="work_email"
        required
        maxLength={200}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
      />
      {free && (
        <span className="mt-1 block text-xs text-amber-700">
          Tip: we recommend using your work email so we can respond faster.
        </span>
      )}
    </label>
  );
}

/** Phone field with a UK format hint. */
export function PhoneField() {
  return (
    <label className="text-sm">
      <span className="text-slate-700 font-medium">Phone (optional)</span>
      <input
        type="tel"
        name="phone"
        maxLength={40}
        placeholder="07700 900123"
        className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <span className="mt-1 block text-xs text-slate-500">
        e.g. 07700 900123 or 020 7946 0958
      </span>
    </label>
  );
}
