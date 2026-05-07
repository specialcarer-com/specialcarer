"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AppLogo, Button, Input, PasswordInput } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";

type SignupRole = "seeker" | "caregiver";

/**
 * Sign Up screen.
 * Asks the user up front whether they're seeking care or providing it,
 * then collects email / password. The chosen role is written both to
 * Supabase auth user_metadata AND to the public.profiles row so the
 * mobile UI shows the right sections after sign-in.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [role, setRole] = useState<SignupRole>("seeker");
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
          data: { role },
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
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-heading">
              I want to:
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  {
                    value: "seeker" as const,
                    title: "Find care",
                    sub: "For me, a loved one or client",
                  },
                  {
                    value: "caregiver" as const,
                    title: "Provide care",
                    sub: "I work as a carer",
                  },
                ]
              ).map((opt) => {
                const active = role === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    aria-pressed={active}
                    className={`rounded-card border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary-50"
                        : "border-line bg-white"
                    }`}
                  >
                    <span
                      className={`block text-[14px] font-bold ${
                        active ? "text-primary" : "text-heading"
                      }`}
                    >
                      {opt.title}
                    </span>
                    <span className="block text-[12px] text-subheading mt-0.5">
                      {opt.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
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
