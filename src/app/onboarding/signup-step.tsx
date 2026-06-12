"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  // Locked role for this sign-up, derived from the ?audience= query param.
  role: "seeker" | "caregiver";
  next: string;
};

const ROLE_LABEL: Record<Props["role"], string> = {
  seeker: "Find care",
  caregiver: "Provide care",
};

export function SignupStep({ role, next }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: displayName.trim(),
            // Persist the locked audience on the auth user so the profile
            // trigger and step 2 default to the right role.
            role,
          },
        },
      });
      if (signUpError) throw signUpError;
      if (!data.session) {
        // Email confirmation is enabled on this project — no session yet.
        throw new Error(
          "Check your inbox to confirm your email, then sign in to continue."
        );
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center gap-2 rounded-xl border border-brand bg-brand-50 px-4 py-3">
        <span className="text-sm font-medium text-brand-700">
          {ROLE_LABEL[role]}
        </span>
        {/* Audience is locked: set by the page you came from, not editable here. */}
        <input type="hidden" name="role" value={role} />
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Display name</span>
        <input
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          placeholder="Jane Doe"
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !email || password.length < 8}
        className="w-full px-4 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Continue"}
      </button>
    </form>
  );
}
