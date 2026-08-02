"use client";

import { useState } from "react";
import { isFreeWebmail, isGmail } from "@/lib/anti-spam/validate-lead";

/**
 * Inline contact form on /organisations#contact and reused on the
 * sub-pages.
 *
 * Free-webmail addresses get a soft client-side tip. Gmail specifically
 * also gets a soft *server-side* block with an override: if the server
 * comes back with `soft: true` (Gmail only), we show its warning and
 * let the user resubmit with `use_personal_email: true` — this restores
 * the pre-PR-175 escape hatch for micro-charities/sole traders whose
 * only email is Gmail, without extending it to any other free-webmail
 * provider (those stay a hard block, per policy).
 *
 * Includes a hidden honeypot field (`website`) that real users never
 * see or fill in; the API drops anything that arrives with it filled.
 */
export default function ContactForm({ source }: { source: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — must stay empty
  const [state, setState] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [gmailOverride, setGmailOverride] = useState(false);
  const [gmailSoftBlocked, setGmailSoftBlocked] = useState(false);

  const free = email ? isFreeWebmail(email) : false;
  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    name.trim().length >= 2 &&
    orgName.trim().length >= 2;

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
          website, // honeypot; left blank by real users
          use_personal_email: gmailOverride || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        soft?: boolean;
      };
      if (!res.ok || !json.ok) {
        if (res.status === 429) {
          setErr(json.message ?? "Too many submissions — try again in an hour.");
          setGmailSoftBlocked(false);
        } else if (json.soft && isGmail(email.trim().toLowerCase())) {
          // Gmail soft-block: show the warning + let the user tick through.
          setErr(json.message ?? "That looks like a personal Gmail address.");
          setGmailSoftBlocked(true);
        } else {
          setErr(json.message ?? "Couldn't send. Please try again.");
          setGmailSoftBlocked(false);
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
      {/* Honeypot: hidden from real users, invisible to screen readers,
          unreachable via Tab. Bots that auto-fill every input trip it. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
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
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </Field>
      </div>
      {free && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-900">
            Tip: we recommend using your work email so we can respond
            faster.
          </p>
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
      {err && (
        <div className="space-y-2">
          <p className="text-sm text-rose-700">{err}</p>
          {gmailSoftBlocked && (
            <label className="flex items-center gap-2 text-xs text-amber-900">
              <input
                type="checkbox"
                checked={gmailOverride}
                onChange={(e) => setGmailOverride(e.target.checked)}
              />
              I don&rsquo;t have an organisation email — use this Gmail address
              anyway
            </label>
          )}
        </div>
      )}
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
