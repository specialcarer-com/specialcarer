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
      router.replace(role === "caregiver" ? "/m/jobs" : "/m/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-white sc-keyboard-aware">
      <div className="sc-safe-top px-6 pt-8 flex flex-col items-center">
        <AppLogo size={92} />
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
