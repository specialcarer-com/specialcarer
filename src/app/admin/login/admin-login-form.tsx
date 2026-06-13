"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Stage = "enter-email" | "enter-code";

const ADMIN_HOME = "/admin/countries";

export function AdminLoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("enter-email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  useEffect(() => {
    if (stage === "enter-code") codeInputRef.current?.focus();
  }, [stage]);

  async function sendCode(emailValue: string) {
    const supabase = createClient();
    // Do not create accounts from the admin login. If the email is not an
    // existing user, the OTP simply won't verify — we never provision admins
    // implicitly here.
    const { error } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: { shouldCreateUser: false },
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
      setErrorMsg(
        err instanceof Error ? err.message : "Couldn't send the code. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    const supabase = createClient();
    try {
      // Supabase issues different OTP token types depending on whether the
      // user already exists; it doesn't surface which one was sent, so try
      // the plausible types in turn (mirrors the user /login flow).
      const cleanCode = code.trim();
      const types = ["email", "magiclink", "recovery", "signup"] as const;
      let verified = false;
      let lastErr: unknown = null;
      for (const type of types) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token: cleanCode,
          type,
        });
        if (!error) {
          verified = true;
          break;
        }
        lastErr = error;
      }
      if (!verified) throw lastErr ?? new Error("Invalid code.");

      // Enforce admin-only access. We are now signed in as this user; check
      // their role and reject (signing them back out) if they are not an admin.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle()
        : { data: null };

      if (!profile || profile.role !== "admin") {
        await supabase.auth.signOut();
        setErrorMsg("Admin access required. Contact support.");
        setSubmitting(false);
        return;
      }

      router.push(ADMIN_HOME);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid code.";
      setErrorMsg(
        msg.toLowerCase().includes("expired") ||
          msg.toLowerCase().includes("invalid")
          ? "That code is invalid or has expired. Request a new one."
          : msg,
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
      setErrorMsg(
        err instanceof Error ? err.message : "Couldn't resend the code.",
      );
    }
  }

  if (stage === "enter-code") {
    return (
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-[#F4EFE6] border border-[#039EA0]/20 text-sm text-[#0F1416]">
          We sent a 6-digit code to <strong>{email}</strong>.
        </div>

        <form onSubmit={handleCodeSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-[#0F1416]">
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
              placeholder="123456"
              className="mt-1 w-full px-4 py-3 rounded-xl border border-[#0F1416]/15 focus:outline-none focus:ring-2 focus:ring-[#039EA0] text-center text-2xl tracking-[0.4em] font-mono text-[#0F1416]"
            />
          </label>

          {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}

          <button
            type="submit"
            disabled={submitting || code.length < 6}
            className="w-full px-4 py-3 rounded-xl bg-[#039EA0] text-white font-semibold hover:bg-[#028688] transition disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "Verify"}
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
            className="text-[#0F1416]/70 hover:text-[#0F1416] underline"
          >
            Use a different email
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-[#039EA0] hover:text-[#028688] disabled:text-[#0F1416]/40 disabled:cursor-not-allowed font-medium"
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
    <form onSubmit={handleEmailSubmit} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-[#0F1416]">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@specialcarers.com"
          autoComplete="email"
          className="mt-1 w-full px-4 py-3 rounded-xl border border-[#0F1416]/15 focus:outline-none focus:ring-2 focus:ring-[#039EA0] text-[#0F1416]"
        />
      </label>

      {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}

      <button
        type="submit"
        disabled={submitting || !email}
        className="w-full px-4 py-3 rounded-xl bg-[#039EA0] text-white font-semibold hover:bg-[#028688] transition disabled:opacity-50"
      >
        {submitting ? "Sending code…" : "Send code"}
      </button>
    </form>
  );
}
