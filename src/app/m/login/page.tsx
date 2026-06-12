"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AppLogo, Button, Input, PasswordInput } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Login screen — Figma 6:192.
 * Welcome Back! / email + password / Forgot password / Login / Sign Up link.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error, data } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      // Role-aware landing: carers go to their jobs feed, everyone else
      // (seekers, admins) goes to /m/home. Reads role from user_metadata
      // (set at sign-up); falls back to /m/home if missing — middleware
      // will then redirect carers to /m/jobs.
      const role = (data.user?.user_metadata as { role?: string } | undefined)?.role;
      const dest = role === "caregiver" ? "/m/jobs" : "/m/home";

      // 2FA step-up (gap 13): if the account has an active TOTP factor, the
      // password sign-in only reaches aal1 — the session is NOT yet trusted.
      // Send the user to the code-entry screen before granting access.
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
        router.replace(`/m/sign-in/2fa?next=${encodeURIComponent(dest)}`);
        return;
      }

      // Admin enforcement (gap 13): if 2FA is required for this user and they
      // have no active factor, block onward access once the grace period has
      // lapsed — they can only enrol. nextLevel === "aal1" here means no factor
      // exists (otherwise the aal2 branch above would have fired).
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("mfa_required, mfa_grace_period_ends_at")
          .eq("id", data.user.id)
          .maybeSingle<{
            mfa_required: boolean | null;
            mfa_grace_period_ends_at: string | null;
          }>();
        if (profile?.mfa_required) {
          const grace = profile.mfa_grace_period_ends_at;
          const lapsed = !grace || new Date(grace).getTime() <= Date.now();
          if (lapsed) {
            router.replace("/m/sign-in/2fa-required");
            return;
          }
        }
      }

      router.replace(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-white sc-keyboard-aware">
      <div className="sc-safe-top px-6 pt-8 flex flex-col items-center">
        <div>
          <AppLogo size={92} />
        </div>
      </div>

      <div className="px-6 mt-8">
        <h1 className="text-center text-[28px] font-bold text-heading">
          Welcome Back!
        </h1>
        <p className="mt-2 text-center text-subheading text-[14px]">
          Sign in to continue your care journey.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div>
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="mt-2 text-right">
              <Link
                href="/m/forgot-password"
                className="text-primary font-bold text-[13px]"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {error && (
            <p className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            block
            disabled={busy || !email || !password}
            aria-busy={busy}
          >
            {busy ? "Signing in…" : "Login"}
          </Button>
        </form>

        <p className="mt-6 text-center text-subheading text-[14px]">
          Don&apos;t have an account?{" "}
          <Link href="/m/sign-up" className="text-secondary font-bold">
            Sign Up
          </Link>
        </p>
      </div>
    </main>
  );
}
