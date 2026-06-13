"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export type SignupAudience = "caregiver" | "family" | "organisation";

type Props = {
  audience: SignupAudience;
  /** Where to send the user once their account exists. */
  next: string;
};

type Stage = "enter-details" | "enter-code";

// Map the marketing audience onto the profile role enum
// (seeker | caregiver | admin | organization). Families are care consumers
// and map to "seeker"; organisations are a first-class role and additionally
// carry their organisation name in metadata, which the handle_new_user()
// trigger uses to create the organizations row + owner membership.
const ROLE_FOR_AUDIENCE: Record<
  SignupAudience,
  "seeker" | "caregiver" | "organization"
> = {
  caregiver: "caregiver",
  family: "seeker",
  organisation: "organization",
};

export function SignupForm({ audience, next }: Props) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("enter-details");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
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
    const { error } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: {
        shouldCreateUser: true,
        // Seed the new user's metadata so the handle_new_user() trigger stamps
        // the right role on profile creation. For organisation sign-ups,
        // organisation_name drives the trigger to create the organizations
        // row + owner membership and link profiles.organization_id.
        data: {
          full_name: fullName.trim(),
          role: ROLE_FOR_AUDIENCE[audience],
          signup_audience: audience,
          ...(audience === "organisation"
            ? { organisation_name: orgName.trim() }
            : {}),
        },
      },
    });
    if (error) throw error;
  }

  async function handleDetailsSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      setErrorMsg(err instanceof Error ? err.message : t("couldntSendCode"));
    } finally {
      setSubmitting(false);
    }
  }

  async function stampProfile() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // Upsert in case the DB trigger hasn't run or didn't capture the role.
    // We never downgrade an existing caregiver/admin here — only fill in the
    // audience for a freshly created account.
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: fullName.trim(),
        role: ROLE_FOR_AUDIENCE[audience],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  }

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const cleanCode = code.trim();
      let lastErr: unknown = null;
      const types = ["email", "magiclink", "signup"] as const;
      let verified = false;
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
      if (!verified) throw lastErr ?? new Error(t("invalidCode"));

      await stampProfile();
      router.push(next);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("invalidCode");
      setErrorMsg(
        msg.toLowerCase().includes("expired") ||
          msg.toLowerCase().includes("invalid")
          ? t("invalidOrExpired")
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
      setErrorMsg(err instanceof Error ? err.message : t("couldntResendCode"));
    }
  }

  if (stage === "enter-code") {
    return (
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
          {t("codeSentTo", { email })}
        </div>

        <form onSubmit={handleCodeSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              {t("verificationCode")}
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
            {submitting ? t("verifying") : t("verifyAndContinue")}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStage("enter-details");
              setCode("");
              setErrorMsg(null);
            }}
            className="text-slate-600 hover:text-slate-900 underline"
          >
            {t("useDifferentEmail")}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-brand hover:text-brand-600 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {resendCooldown > 0
              ? t("resendIn", { seconds: resendCooldown })
              : t("resendCode")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleDetailsSubmit} className="space-y-3">
      {audience === "organisation" && (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            {t("organisationName")}
          </span>
          <input
            type="text"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder={t("organisationNamePlaceholder")}
            autoComplete="organization"
            className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          {audience === "organisation" ? t("contactName") : t("displayName")}
        </span>
        <input
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("displayNamePlaceholder")}
          autoComplete="name"
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t("email")}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}

      <button
        type="submit"
        disabled={
          submitting ||
          !email ||
          !fullName ||
          (audience === "organisation" && !orgName)
        }
        className="w-full px-4 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition disabled:opacity-50"
      >
        {submitting ? t("sendingCode") : t("sendCode")}
      </button>

      <p className="text-xs text-slate-500 text-center pt-1">
        {t("scannerNote")}
      </p>
    </form>
  );
}
