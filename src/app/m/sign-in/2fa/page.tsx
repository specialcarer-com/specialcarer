"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppLogo, Button, Input } from "../../_components/ui";

/**
 * Sign-in 2FA challenge — /m/sign-in/2fa (gap 13).
 *
 * Reached after a successful password sign-in when the account has an active
 * TOTP factor (the session is still aal1). The user enters their 6-digit
 * authenticator code — or switches to a recovery code — and on success we
 * redirect to the original destination (?next=).
 */
function TwoFactorChallenge() {
  const t = useTranslations("security");
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/m/home";

  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [recovery]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        router.replace(next);
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

  return (
    <main className="min-h-[100dvh] bg-white sc-keyboard-aware">
      <div className="sc-safe-top px-6 pt-8 flex flex-col items-center">
        <AppLogo size={92} />
      </div>

      <div className="px-6 mt-8">
        <h1 className="text-center text-[28px] font-bold text-heading">
          {t("challengeTitle")}
        </h1>
        <p className="mt-2 text-center text-subheading text-[14px]">
          {recovery ? t("challengeRecoveryHint") : t("challengeHint")}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="mt-8 space-y-5"
        >
          <Input
            ref={inputRef}
            label={recovery ? t("recoveryCodeLabel") : t("codeLabel")}
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            placeholder={recovery ? "XXXX-XXXX-…" : "123456"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />

          {error && (
            <p className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" block disabled={busy || !code.trim()} aria-busy={busy}>
            {busy ? t("verifying") : t("verify")}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setRecovery((v) => !v);
            setCode("");
            setError(null);
          }}
          className="mt-6 w-full text-center text-primary font-bold text-[13px]"
        >
          {recovery ? t("useAuthenticatorInstead") : t("useRecoveryCodeInstead")}
        </button>
      </div>
    </main>
  );
}

export default function TwoFactorChallengePage() {
  return (
    <Suspense fallback={null}>
      <TwoFactorChallenge />
    </Suspense>
  );
}
