"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TopBar, Button, Card, Input } from "../../_components/ui";
import { Enrolment } from "./Enrolment";
import { formatRecoveryCode } from "@/lib/security/recovery-codes";
import type { TwoFactorStatus } from "@/app/api/m/security/2fa/status/route";
import type { VerifyResponse } from "@/app/api/m/security/2fa/verify/route";

/**
 * Security settings — /m/profile/security (gap 13).
 *
 * Shows whether TOTP 2FA is on, and the recovery-codes-remaining count. Off →
 * enrolment flow. On → regenerate recovery codes (TOTP required) and disable
 * 2FA (TOTP or recovery code required).
 */
export default function SecurityPage() {
  const t = useTranslations("security");
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Inline code-entry panels for the two destructive/sensitive actions.
  const [panel, setPanel] = useState<"none" | "regenerate" | "disable">("none");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/m/security/2fa/status", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) setStatus((await res.json()) as TwoFactorStatus);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetPanel() {
    setPanel("none");
    setCode("");
    setError(null);
  }

  async function regenerate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/m/security/2fa/recovery-codes/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(res.status === 429 ? t("rateLimited") : j.error || t("codeMismatch"));
        return;
      }
      const j = (await res.json()) as VerifyResponse;
      setNewCodes(j.recoveryCodes);
      resetPanel();
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/m/security/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(res.status === 429 ? t("rateLimited") : j.error || t("codeMismatch"));
        return;
      }
      resetPanel();
      setNewCodes(null);
      void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-screen">
      <TopBar title={t("title")} back="/m/profile" />

      <div className="px-5 pt-4 pb-16 space-y-4">
        <p className="text-[13px] text-subheading leading-relaxed">{t("intro")}</p>

        {!loaded ? (
          <div className="h-28 rounded-card bg-muted animate-pulse" />
        ) : status?.enabled ? (
          <>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-bold text-heading">{t("statusOnTitle")}</p>
                  <p className="text-[12.5px] text-subheading">{t("statusOnSub")}</p>
                </div>
                <span className="rounded-pill bg-primary-50 px-3 py-1 text-[12px] font-bold text-primary">
                  {t("on")}
                </span>
              </div>
              <p className="mt-3 text-[12.5px] text-heading">
                {t("codesRemaining", { count: status.recoveryCodesRemaining })}
              </p>
            </Card>

            {newCodes && (
              <Card>
                <p className="text-[14px] font-bold text-heading mb-1">{t("recoveryTitle")}</p>
                <p className="text-[12.5px] text-subheading mb-3 leading-snug">
                  {t("recoveryIntro")}
                </p>
                <ul className="grid grid-cols-2 gap-2 rounded-card bg-muted p-3">
                  {newCodes.map((c) => (
                    <li key={c} className="font-mono text-[13px] text-heading">
                      {formatRecoveryCode(c)}
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Button size="sm" block variant="outline" onClick={() => setNewCodes(null)}>
                    {t("savedCodes")}
                  </Button>
                </div>
              </Card>
            )}

            {panel === "none" && (
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => setPanel("regenerate")}>
                  {t("regenerate")}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setPanel("disable")}>
                  {t("disable")}
                </Button>
              </div>
            )}

            {panel !== "none" && (
              <Card>
                <p className="text-[14px] font-bold text-heading mb-1">
                  {panel === "disable" ? t("disableTitle") : t("regenerateTitle")}
                </p>
                <p className="text-[12.5px] text-subheading mb-3 leading-snug">
                  {panel === "disable" ? t("disableHelp") : t("regenerateHelp")}
                </p>
                <Input
                  label={panel === "disable" ? t("codeOrRecoveryLabel") : t("codeLabel")}
                  inputMode="text"
                  autoComplete="one-time-code"
                  placeholder={panel === "disable" ? t("codeOrRecoveryPlaceholder") : "123456"}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                {error && <p className="mt-2 text-[12.5px] text-[#C22]">{error}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={resetPanel} disabled={busy}>
                    {t("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    variant={panel === "disable" ? "danger" : "primary"}
                    onClick={panel === "disable" ? disable : regenerate}
                    disabled={busy || !code.trim()}
                  >
                    {busy ? t("working") : panel === "disable" ? t("confirmDisable") : t("confirmRegenerate")}
                  </Button>
                </div>
              </Card>
            )}
          </>
        ) : (
          <>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-bold text-heading">{t("statusOffTitle")}</p>
                  <p className="text-[12.5px] text-subheading">{t("statusOffSub")}</p>
                </div>
                <span className="rounded-pill bg-muted px-3 py-1 text-[12px] font-bold text-subheading">
                  {t("off")}
                </span>
              </div>
            </Card>
            <Enrolment onDone={() => void load()} />
          </>
        )}
      </div>
    </div>
  );
}
