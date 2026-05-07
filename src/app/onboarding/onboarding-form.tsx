"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  defaultName: string;
  defaultCountry: string;
  defaultRole: "seeker" | "caregiver" | "admin";
  next: string;
};

export function OnboardingForm({
  defaultName,
  defaultCountry,
  defaultRole,
  next,
}: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultName);
  const [country, setCountry] = useState(defaultCountry || "GB");
  const [role, setRole] = useState<"seeker" | "caregiver">(
    defaultRole === "caregiver" ? "caregiver" : "seeker"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Upsert because the trigger may not have fired yet for OAuth users
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name: fullName.trim(),
            country,
            role,
            locale: country === "US" ? "en-US" : "en-GB",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      if (upsertError) throw upsertError;
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-slate-700 mb-2">
          I&rsquo;m here to…
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`flex flex-col p-4 rounded-xl border cursor-pointer ${
              role === "seeker"
                ? "border-brand bg-brand-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="role"
              value="seeker"
              checked={role === "seeker"}
              onChange={() => setRole("seeker")}
              className="sr-only"
            />
            <span className="font-medium">Find care</span>
            <span className="text-xs text-slate-500 mt-1">
              For me, my client, my child, or a loved one
            </span>
          </label>
          <label
            className={`flex flex-col p-4 rounded-xl border cursor-pointer ${
              role === "caregiver"
                ? "border-brand bg-brand-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="role"
              value="caregiver"
              checked={role === "caregiver"}
              onChange={() => setRole("caregiver")}
              className="sr-only"
            />
            <span className="font-medium">Provide care</span>
            <span className="text-xs text-slate-500 mt-1">
              I&rsquo;m a caregiver looking for work
            </span>
          </label>
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Full name</span>
        <input
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          placeholder="Jane Doe"
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Country</span>
        <select
          required
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand bg-white"
        >
          <option value="GB">United Kingdom</option>
          <option value="US">United States</option>
        </select>
      </label>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
