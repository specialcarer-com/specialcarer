"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AppLogo, Button, Input, TopBar } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Forgot Password — Figma 6:410.
 * Sends a Supabase reset email. Supabase generates the recovery link;
 * we don't need a custom backend route.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/m/login`
            : undefined,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-white sc-keyboard-aware">
      <TopBar back="/m/login" title="Forgot Password" />

      <div className="px-6 mt-4">
        <div className="flex justify-center mb-6">
          <AppLogo size={72} />
        </div>
        {!sent ? (
          <>
            <p className="text-subheading text-[14px] leading-relaxed">
              Enter the email address linked to your SpecialCarer account.
              We&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-5">
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

              {error && (
                <p className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" block disabled={busy || !email}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        ) : (
          <div className="mt-10 text-center">
            <div className="mx-auto w-16 h-16 grid place-items-center rounded-full bg-primary-50 text-primary text-2xl">
              ✓
            </div>
            <h2 className="mt-4 text-[20px] font-bold text-heading">
              Check your inbox
            </h2>
            <p className="mt-2 text-subheading text-[14px]">
              We&apos;ve sent a password reset link to <strong>{email}</strong>.
              Tap the link in the email, then come back and log in.
            </p>
            <div className="mt-8">
              <Link
                href="/m/login"
                className="text-primary font-bold text-[15px]"
              >
                Back to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
