"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AddCountryForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [flag, setFlag] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [locale, setLocale] = useState("en-GB");
  const [order, setOrder] = useState(100);
  const [signup, setSignup] = useState(false);
  const [search, setSearch] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setCode("");
    setName("");
    setFlag("");
    setCurrency("GBP");
    setLocale("en-GB");
    setOrder(100);
    setSignup(false);
    setSearch(false);
    setNotes("");
    setErr(null);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          flag_emoji: flag.trim(),
          currency_code: currency.trim().toUpperCase(),
          default_locale: locale.trim(),
          display_order: order,
          enabled_for_signup: signup,
          enabled_for_search: search,
          notes: notes.trim(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(
          j.error === "country_exists"
            ? "A country with that code already exists."
            : j.error === "invalid_code"
              ? "Code must be a 2-letter ISO code (e.g. IE)."
              : (j.error ?? "Failed to add country"),
        );
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
      >
        Add country
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add country"
        >
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Add country
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Code (ISO 3166-1 alpha-2)
                </span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={2}
                  placeholder="IE"
                  className={`${field} font-mono uppercase`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Flag</span>
                <input
                  value={flag}
                  onChange={(e) => setFlag(e.target.value)}
                  placeholder="🇮🇪"
                  className={field}
                />
              </label>
              <label className="col-span-2 block">
                <span className="text-xs font-medium text-slate-600">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ireland"
                  className={field}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Currency (ISO 4217)
                </span>
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="GBP"
                  className={`${field} uppercase`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Locale
                </span>
                <input
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  placeholder="en-GB"
                  className={field}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Display order
                </span>
                <input
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(Number(e.target.value))}
                  className={field}
                />
              </label>
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={signup}
                    onChange={(e) => setSignup(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary"
                  />
                  Signup
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={search}
                    onChange={(e) => setSearch(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary"
                  />
                  Search
                </label>
              </div>
              <label className="col-span-2 block">
                <span className="text-xs font-medium text-slate-600">
                  Notes (optional)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={field}
                />
              </label>
            </div>

            {err && (
              <p aria-live="polite" className="text-sm text-rose-700">
                {err}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || code.trim().length !== 2 || !name.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
              >
                {busy ? "Adding…" : "Add country"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
