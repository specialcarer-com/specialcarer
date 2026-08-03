"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CountryOption = { code: string; name: string };

type Props = {
  defaultName: string;
  defaultCountry: string;
  defaultRole: "seeker" | "caregiver" | "admin";
  countries: CountryOption[];
  next: string;
};

export function OnboardingForm({
  defaultName,
  defaultCountry,
  defaultRole,
  countries,
  next,
}: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultName);
  const [country, setCountry] = useState(
    defaultCountry || countries[0]?.code || "GB"
  );
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

  const seekerSelected = role === "seeker";
  const caregiverSelected = role === "caregiver";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-slate-700">
          Which describes you?
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Seeker tile */}
          <label
            className="group relative flex cursor-pointer flex-col rounded-xl border p-4 transition"
            style={{
              borderColor: seekerSelected ? "#F4A261" : "#E5E7EB",
              background: seekerSelected ? "#FDF4E9" : "#FFFFFF",
              boxShadow: seekerSelected
                ? "0 0 0 3px rgba(244, 162, 97, 0.18)"
                : undefined,
            }}
          >
            <input
              type="radio"
              name="role"
              value="seeker"
              checked={seekerSelected}
              onChange={() => setRole("seeker")}
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: seekerSelected ? "#F4A261" : "#F4EFE6",
                  color: seekerSelected ? "#FFFFFF" : "#8A5A26",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 21s-7-4.5-7-10a5 5 0 019-3 5 5 0 019 3c0 5.5-7 10-7 10z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    fill={seekerSelected ? "currentColor" : "none"}
                    fillOpacity={seekerSelected ? 0.2 : 0}
                  />
                </svg>
              </span>
              <div>
                <span className="block font-medium text-slate-900">
                  Find care
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  for me, my child, or a loved one
                </span>
              </div>
            </div>
          </label>

          {/* Caregiver tile */}
          <label
            className="group relative flex cursor-pointer flex-col rounded-xl border p-4 transition"
            style={{
              borderColor: caregiverSelected ? "#039EA0" : "#E5E7EB",
              background: caregiverSelected ? "#E6F5F5" : "#FFFFFF",
              boxShadow: caregiverSelected
                ? "0 0 0 3px rgba(3, 158, 160, 0.18)"
                : undefined,
            }}
          >
            <input
              type="radio"
              name="role"
              value="caregiver"
              checked={caregiverSelected}
              onChange={() => setRole("caregiver")}
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: caregiverSelected ? "#039EA0" : "#E6F5F5",
                  color: caregiverSelected ? "#FFFFFF" : "#016E70",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="8"
                    r="3.2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                  />
                  <path
                    d="M5 20c1-3.6 4-5.5 7-5.5s6 1.9 7 5.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </span>
              <div>
                <span className="block font-medium text-slate-900">
                  Provide care
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  personal and clinical support for families
                </span>
              </div>
            </div>
          </label>
        </div>
        <p className="mt-3 text-xs leading-snug text-slate-500">
          Choose carefully &mdash; this decides whether you&rsquo;ll book care
          or offer it. Support can change it later if needed.
        </p>
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
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#039EA0] focus:border-transparent"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Country</span>
        <select
          required
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#039EA0] focus:border-transparent"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl px-4 py-3.5 font-medium text-white transition disabled:opacity-60"
        style={{
          background: submitting
            ? "#028688"
            : "linear-gradient(180deg, #039EA0 0%, #028688 100%)",
          boxShadow: "0 1px 2px rgba(2, 134, 136, 0.25)",
        }}
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
