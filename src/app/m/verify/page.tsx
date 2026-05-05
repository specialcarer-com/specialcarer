"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLogo, Button, TopBar } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Verify Account — Figma 22:425.
 *
 * Single text field that accepts the full Supabase OTP range (6–10
 * digits). Earlier we used a six-box grid which silently truncated
 * 7-digit codes (some Supabase email templates render extra digits if
 * the project's auth.otp_length is changed) and produced "Token has
 * invalid format" errors. Single field handles paste, autofill, and
 * any length cleanly.
 *
 * The user's email is passed in via ?email=... after sign-up.
 */

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resend cooldown timer
  useEffect(() => {
    if (!resentAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [resentAt]);

  const cooldown = resentAt
    ? Math.max(0, 30 - Math.floor((Date.now() - resentAt) / 1000))
    : 0;
  // ensures `tick` is referenced so the timer re-renders the cooldown
  void tick;

  // Autofocus on mount so iOS/Android jump straight into entry.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onChange = (raw: string) => {
    // Strip spaces, dashes, anything non-digit. Cap at 10 (Supabase max).
    const cleaned = raw.replace(/\D/g, "").slice(0, 10);
    setCode(cleaned);
  };

  const submit = async () => {
    setError(null);
    if (code.length < 6) {
      setError("Please enter the full verification code from your email.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) {
        setError(error.message);
        return;
      }
      router.replace("/m/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || !email) return;
    setError(null);
    try {
      const supabase = createClient();
      await supabase.auth.resend({ type: "signup", email });
      setResentAt(Date.now());
      setCode("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    }
  };

  return (
    <main className="min-h-[100dvh] bg-white sc-keyboard-aware">
      <TopBar back="/m/sign-up" title="Verify your account" />

      <div className="px-6 mt-2">
        <div className="flex justify-center mb-6">
          <AppLogo size={72} />
        </div>
        <p className="text-subheading text-[14px] leading-relaxed">
          We&apos;ve emailed a verification code to{" "}
          <strong className="text-heading">{email || "your email"}</strong>.
          Enter it below to continue. The code expires in 1 hour.
        </p>

        <div className="mt-2">
          <p className="text-[13px] text-subheading">
            Tip: the email may land in your spam or junk folder.
          </p>
        </div>

        <div className="mt-7">
          <label
            htmlFor="otp"
            className="block text-[13px] font-semibold text-heading mb-2"
          >
            Verification code
          </label>
          <input
            id="otp"
            ref={inputRef}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            // Hint for iOS to surface the SMS/email autofill suggestion
            // even though Supabase delivers via email.
            pattern="[0-9]*"
            maxLength={10}
            placeholder="123456"
            aria-label="Verification code"
            className="w-full text-center tracking-[0.6em] text-[26px] font-bold text-heading rounded-btn border border-line bg-white px-4 py-4 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
          <p className="mt-2 text-[12px] text-subheading">
            Paste the full code from your email — any length between 6 and 10 digits.
          </p>
        </div>

        {error && (
          <p className="mt-4 text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-7">
          <Button block onClick={submit} disabled={busy}>
            {busy ? "Verifying…" : "Verify"}
          </Button>
        </div>

        <p className="mt-6 text-center text-subheading text-[14px]">
          Didn&apos;t receive the code?{" "}
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0}
            className="text-secondary font-bold disabled:text-subheading"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
          </button>
        </p>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
