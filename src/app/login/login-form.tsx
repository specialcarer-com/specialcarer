"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { redirectTo: string };
type Stage = "enter-email" | "enter-code";

export function LoginForm({ redirectTo }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("enter-email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const googleEnabled =
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (stage === "enter-code") codeInputRef.current?.focus();
  }, [stage]);

  async function sendCode(emailValue: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: {
        // Setting shouldCreateUser=true is the default; included for clarity
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    const cleaned = email.trim().toLowerCase();
    try {
      await sendCode(cleaned);
      setEmail(cleaned);
      setStage("enter-code");
      setResendCooldown(30);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Couldn't send code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      // Try "email" type first (new sign-up / first-time OTP),
      // then fall back to "magiclink" (existing user OTP from signInWithOtp).
      // Supabase issues different token types depending on whether the user
      // already exists, but does not surface which one was sent.
      const cleanCode = code.trim();
      let lastErr: unknown = null;
      const types = ["email", "magiclink", "recovery", "signup"] as const;
      let verified = false;
      for (const t of types) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token: cleanCode,
          type: t,
        });
        if (!error) {
          verified = true;
          break;
        }
        lastErr = error;
      }
      if (!verified) throw lastErr ?? new Error("Invalid code");
      // Decide where to send them based on profile completeness
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, country")
          .eq("id", user.id)
          .maybeSingle();
        if (!profile?.full_name || !profile?.country) {
          router.push(`/onboarding?next=${encodeURIComponent(redirectTo)}`);
        } else {
          router.push(redirectTo);
        }
      } else {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid code";
      setErrorMsg(
        msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid")
          ? "That code is invalid or expired. Try again or request a new one."
          : msg
      );
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setErrorMsg(null);
    try {
      await sendCode(email);
      setResendCooldown(30);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Couldn't resend code");
    }
  }

  function handleGoogle() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            redirectTo
          )}`,
        },
      });
    });
  }

  if (stage === "enter-code") {
    return (
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
          We sent a code to <strong>{email}</strong>. Enter it below.
          The code expires in 1 hour.
        </div>

        <form onSubmit={handleCodeSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Verification code
            </span>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6,10}"
              maxLength={10}
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="12345678"
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand text-center text-2xl tracking-[0.4em] font-mono"
            />
          </label>

          {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}

          <button
            type="submit"
            disabled={submitting || code.length < 6}
            className="w-full px-4 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "Verify and continue"}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStage("enter-email");
              setCode("");
              setErrorMsg(null);
            }}
            className="text-slate-600 hover:text-slate-900 underline"
          >
            Use a different email
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-brand hover:text-brand-600 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : "Resend code"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {googleEnabled && (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition font-medium"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex-1 h-px bg-slate-200" />
            <span>or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
        </>
      )}

      <form onSubmit={handleEmailSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>

        {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={submitting || !email}
          className="w-full px-4 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition disabled:opacity-50"
        >
          {submitting ? "Sending code…" : "Email me a sign-in code"}
        </button>

        <p className="text-xs text-slate-500 text-center pt-1">
          We&rsquo;ll email you a numeric code instead of a clickable link, so
          email scanners can&rsquo;t hijack your sign-in.
        </p>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5C29.5 34.4 26.9 35 24 35c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.5 39.7 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.5 5.5c-.4.4 6.6-4.8 6.6-15.1 0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
