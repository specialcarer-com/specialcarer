"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["seeker", "caregiver", "admin"] as const;
type Role = (typeof ROLES)[number];

export default function AddUser() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("seeker");
  const [country, setCountry] = useState<"" | "GB" | "US">("");
  const [phone, setPhone] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setFullName("");
    setRole("seeker");
    setCountry("");
    setPhone("");
    setSendInvite(true);
    setReason("");
    setError(null);
    setOkMsg(null);
  }

  async function submit() {
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim() || undefined,
          role,
          country: country || undefined,
          phone: phone.trim() || undefined,
          send_invite: sendInvite,
          reason: reason.trim(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        user_id?: string;
      };
      if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
      setOkMsg(
        sendInvite
          ? `Invited ${email}. They'll get an email to set a password.`
          : `Created ${email}. Share login details with the user manually.`,
      );
      // Clear form but keep dialog open so admin can verify the success message.
      setEmail("");
      setFullName("");
      setPhone("");
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
        className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
      >
        + Add user
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Add user</h3>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          Close ✕
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Email *">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            placeholder="user@example.com"
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
        <Field label="Role *">
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`text-xs font-medium px-3 py-1 rounded-md border ${
                  role === r
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Country">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as "" | "GB" | "US")}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="">—</option>
            <option value="GB">UK</option>
            <option value="US">US</option>
          </select>
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          />
        </Field>
        <div />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={sendInvite}
          onChange={(e) => setSendInvite(e.target.checked)}
        />
        Send invite email so the user can set their own password
      </label>

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
          disabled={pending || !email.trim() || !reason.trim()}
          className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create user"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-rose-700">{error}</span>}
        {okMsg && <span className="text-xs text-emerald-700">{okMsg}</span>}
      </div>
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
