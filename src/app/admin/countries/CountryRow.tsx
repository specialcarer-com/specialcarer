"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CountryRowData } from "./page";

function Toggle({
  on,
  busy,
  label,
  onChange,
}: {
  on: boolean;
  busy: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
        on ? "bg-primary" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function CountryRow({ initial }: { initial: CountryRowData }) {
  const router = useRouter();
  const [signup, setSignup] = useState(initial.enabled_for_signup);
  const [search, setSearch] = useState(initial.enabled_for_search);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patch(field: string, value: boolean, rollback: () => void) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/countries/${encodeURIComponent(initial.code)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Save failed");
        rollback();
        return;
      }
      router.refresh();
    } catch {
      setErr("Network error");
      rollback();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete ${initial.name} (${initial.code})? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/countries/${encodeURIComponent(initial.code)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Delete failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="text-slate-800">
      <td className="px-4 py-3 font-mono font-semibold">{initial.code}</td>
      <td className="px-4 py-3 text-xl leading-none">
        {initial.flag_emoji ?? "—"}
      </td>
      <td className="px-4 py-3">
        {initial.name}
        {err && (
          <p aria-live="polite" className="text-xs text-rose-700">
            {err}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <Toggle
          on={signup}
          busy={busy}
          label={`Enable signup for ${initial.name}`}
          onChange={(next) => {
            setSignup(next);
            patch("enabled_for_signup", next, () => setSignup(!next));
          }}
        />
      </td>
      <td className="px-4 py-3 text-center">
        <Toggle
          on={search}
          busy={busy}
          label={`Enable search for ${initial.name}`}
          onChange={(next) => {
            setSearch(next);
            patch("enabled_for_search", next, () => setSearch(!next));
          }}
        />
      </td>
      <td className="px-4 py-3">{initial.currency_code}</td>
      <td className="px-4 py-3">{initial.default_locale}</td>
      <td className="px-4 py-3 text-center">{initial.display_order}</td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
