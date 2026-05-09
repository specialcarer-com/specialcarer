"use client";

import { useState } from "react";

const FREE_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "outlook.co.uk",
  "live.com",
  "live.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "tutanota.com",
  "gmx.com",
  "gmx.co.uk",
]);

function isFreeEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return FREE_DOMAINS.has(email.slice(at + 1).trim().toLowerCase());
}

/**
 * Inline contact form on /organisations#contact and reused on the
 * sub-pages. Free-webmail addresses warn but don't block — same UX as
 * the registration flow.
 */
export default function ContactForm({ source }: { source: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [override, setOverride] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);

  const free = email ? isFreeEmail(email) : false;
  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    name.trim().length >= 2 &&
    orgName.trim().length >= 2 &&
    (!free || override);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setState("sending");
    setErr(null);
    try {
      const res = await fetch("/api/marketing/org-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: name.trim(),
          work_email: email.trim().toLowerCase(),
          org_name: orgName.trim(),
          role: role.trim() || undefined,
          message: message.trim() || undefined,
          source,
          free_email_override: override,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        free_email?: boolean;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        if (json.free_email) {
          setErr(json.message ?? "Use a work email or tick 'Continue anyway'.");
        } else if (res.status === 429) {
          setErr("Too many submissions — try again in an hour.");
        } else {
          setErr(json.error ?? "Couldn't send. Please try again.");
        }
        setState("err");
        return;
      }
      setState("ok");
    } catch {
      setErr("Network error.");
      setState("err");
    }
  }

  if (state === "ok") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-emerald-800 text-sm">
        Thanks — we&rsquo;ll be in touch within 1 business day.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Your name *">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </Field>
        <Field label="Work email *">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setOverride(false);
            }}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </Field>
      </div>
      {free && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-900">
            That looks like a personal email. Use a work address where
            possible — or tick the box to continue.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-amber-900">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Continue anyway
          </label>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Organisation *">
          <input
            type="text"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </Field>
        <Field label="Your role">
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Placement officer"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </Field>
      </div>
      <Field label="Message">
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
          placeholder="Tell us about your team and what you&rsquo;re looking for."
          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />
      </Field>
      {err && <p className="text-sm text-rose-700">{err}</p>}
      <button
        type="submit"
        disabled={!valid || state === "sending"}
        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Talk to our team"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-800 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
