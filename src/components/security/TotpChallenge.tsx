"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { sanitiseTotpCode } from "@/lib/security/mfa-gate";

type Props = {
  /** Default destination after successful verification. */
  defaultNext?: string;
};

/**
 * Web sign-in TOTP challenge (Sprint 2.1). Shown after first-factor auth when
 * the user has an enrolled factor and the session is still AAL1.
 */
function TotpChallengeInner({ defaultNext = "/dashboard" }: Props) {
  const t = useTranslations("security");
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || defaultNext;

  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noFactor, setNoFactor] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [recovery]);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp ?? []).some((f) => f.status === "verified");
      if (!verified) setNoFactor(true);
    })();
  }, []);

  async function submit() {
    setError(null);
    const trimmed = code.trim();
    if (!recovery && !sanitiseTotpCode(trimmed)) {
      setError(t("codeMismatch"));
      return;
    }
    if (!trimmed) return;

    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: trimmed }),
      });
      if (res.ok) {
        const supabase = createClient();
        await supabase.auth.refreshSession();
        router.replace(next);
        router.refresh();
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(res.status === 429 ? t("rateLimited") : j.error || t("codeMismatch"));
    } catch {
      setError(t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  if (noFactor) {
    return (
      <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6 text-center">
        <p className="text-sm text-[#0F1416]/70">{t("genericError")}</p>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="mt-4 text-sm font-semibold text-[#039EA0] underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6">
      <h2 className="text-xl font-bold text-[#0F1416] text-center">{t("challengeTitle")}</h2>
      <p className="mt-2 text-sm text-[#0F1416]/70 text-center">
        {recovery ? t("challengeRecoveryHint") : t("challengeHint")}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-6 space-y-4"
      >
        <label className="block">
          <span className="text-sm font-medium text-[#0F1416]">
            {recovery ? t("recoveryCodeLabel") : t("codeLabel")}
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            placeholder={recovery ? "XXXX-XXXX-…" : "123456"}
            value={code}
            onChange={(e) =>
              setCode(
                recovery
                  ? e.target.value
                  : e.target.value.replace(/\D/g, "").slice(0, 6),
              )
            }
            required
            className="mt-1 w-full px-4 py-3 rounded-xl border border-[#0F1416]/15 focus:outline-none focus:ring-2 focus:ring-[#039EA0] text-center text-2xl tracking-[0.4em] font-mono"
          />
        </label>

        {error && (
          <p className="text-sm text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !code.trim()}
          aria-busy={busy}
          className="w-full px-4 py-3 rounded-xl bg-[#039EA0] text-white font-semibold hover:bg-[#028688] transition disabled:opacity-50"
        >
          {busy ? t("verifying") : t("verify")}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setRecovery((v) => !v);
          setCode("");
          setError(null);
        }}
        className="mt-4 w-full text-center text-[#039EA0] font-semibold text-sm"
      >
        {recovery ? t("useAuthenticatorInstead") : t("useRecoveryCodeInstead")}
      </button>

      <p className="mt-6 text-xs text-[#0F1416]/60 text-center leading-relaxed">
        {t("supportRecoveryNote")}
      </p>
    </div>
  );
}

export function TotpChallenge(props: Props) {
  return (
    <Suspense fallback={<div className="h-48 rounded-2xl bg-[#F4EFE6] animate-pulse" />}>
      <TotpChallengeInner {...props} />
    </Suspense>
  );
}
