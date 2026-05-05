"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, TopBar } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Verify Account — Figma 22:425.
 * Six-digit OTP entry that talks to Supabase auth.verifyOtp({type:'email'}).
 * The user's email is passed in via ?email=... after sign-up.
 */

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown timer
  useEffect(() => {
    if (!resentAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [resentAt]);

  const cooldown = resentAt
    ? Math.max(0, 30 - Math.floor((Date.now() - resentAt) / 1000))
    : 0;
  // ensures `tick` is "used" so the timer above triggers re-renders
  void tick;

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 1);
    const next = [...code];
    next[i] = clean;
    setCode(next);
    if (clean && i < 5) inputs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;
    e.preventDefault();
    const next = Array(6).fill("");
    pasted.split("").forEach((c, i) => (next[i] = c));
    setCode(next);
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const submit = async () => {
    setError(null);
    const token = code.join("");
    if (token.length !== 6) {
      setError("Please enter all six digits.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    }
  };

  return (
    <main className="min-h-[100dvh] bg-white sc-keyboard-aware">
      <TopBar back="/m/sign-up" title="Verify your account" />

      <div className="px-6 mt-2">
        <p className="text-subheading text-[14px] leading-relaxed">
          We&apos;ve sent a 6-digit verification code to{" "}
          <strong className="text-heading">{email || "your email"}</strong>.
          Enter it below to continue.
        </p>

        <div className="mt-8 flex items-center justify-between gap-2">
          {code.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !d && i > 0) {
                  inputs.current[i - 1]?.focus();
                }
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              aria-label={`Digit ${i + 1} of 6`}
              className="w-12 h-14 text-center text-[22px] font-bold text-heading rounded-btn border border-line bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
          ))}
        </div>

        {error && (
          <p className="mt-4 text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-8">
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
