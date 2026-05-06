"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function EditUser({
  userId,
  currentEmail,
  currentName,
  currentPhone,
  currentCountry,
}: {
  userId: string;
  currentEmail: string | null;
  currentName: string | null;
  currentPhone: string | null;
  currentCountry: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [fullName, setFullName] = useState(currentName ?? "");
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [country, setCountry] = useState(currentCountry ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dirty =
    email.trim().toLowerCase() !== (currentEmail ?? "").toLowerCase() ||
    fullName.trim() !== (currentName ?? "") ||
    phone.trim() !== (currentPhone ?? "") ||
    country.trim() !== (currentCountry ?? "");

  async function submit() {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim(),
          phone: phone.trim(),
          country: country.trim(),
          reason,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setOpen(false);
      setReason("");
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800"
      >
        Edit user
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Edit user</h3>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          />
        </Field>
        <Field label="Full name">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          />
        </Field>
        <Field label="Country">
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="UK / US / etc."
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          />
        </Field>
      </div>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required) — recorded in audit log"
        rows={2}
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !reason.trim() || !dirty}
          className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
            setEmail(currentEmail ?? "");
            setFullName(currentName ?? "");
            setPhone(currentPhone ?? "");
            setCountry(currentCountry ?? "");
          }}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-rose-700">{error}</span>}
      </div>

      <p className="text-xs text-slate-500">
        Changing the email here verifies the new address automatically — the
        user will not need to re-confirm.
      </p>
    </div>
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
      <span className="block text-xs text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
