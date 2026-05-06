"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AppLogo, Button, Input, PasswordInput } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign Up screen — Figma 6:318.
 * Email / Password / Confirm Password / Sign Up.
 *
 * The role (seeker vs carer) defaults to "seeker" here. Carers convert
 * later in onboarding via /m/become-a-caregiver — keeps signup friction
 * low for the larger seeker audience.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Where the email's "Confirm your account" button should land.
          // Supabase rewrites this through /auth/callback; we pass
          // ?flow=mobile so the callback hands the user back to /m/* even
          // if Site URL points at the web canvas.
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback?flow=mobile&next=/m/home`
              : undefined,
          data: { role: "seeker" },
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      // Supabase sends a confirmation email — ask the user to enter the OTP.
      router.replace(
        `/m/verify?email=${encodeURIComponent(email.trim())}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-white sc-keyboard-aware">
      <div className="sc-safe-top px-6 pt-8 flex flex-col items-center">
        <AppLogo size={88} />
      </div>

      <div className="px-6 mt-6">
        <h1 className="text-center text-[26px] font-bold text-heading">
          Create an Account
        </h1>
        <p className="mt-2 text-center text-subheading text-[14px]">
          To create an account, please enter your details.
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
          <PasswordInput
            label="Password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <PasswordInput
            label="Confirm Password"
            autoComplete="new-password"
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />

          {error && (
            <p className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            block
            disabled={busy || !email || !password || !confirm}
            aria-busy={busy}
          >
            {busy ? "Creating account…" : "Sign Up"}
          </Button>

          <p className="text-center text-subheading text-[12px] leading-snug">
            By continuing you agree to the{" "}
            <Link
              href="/terms"
              className="underline decoration-line"
              target="_blank"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline decoration-line"
              target="_blank"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </form>

        <p className="mt-4 text-center text-subheading text-[14px]">
          Already have an account?{" "}
          <Link href="/m/login" className="text-secondary font-bold">
            Log In
          </Link>
        </p>
      </div>
    </main>
  );
}
