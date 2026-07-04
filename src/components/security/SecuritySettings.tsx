"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TotpEnrolment } from "./TotpEnrolment";
import { formatRecoveryCode } from "@/lib/security/recovery-codes";
import type { TwoFactorStatus } from "@/app/api/m/security/2fa/status/route";
import type { VerifyResponse } from "@/app/api/m/security/2fa/verify/route";

/**
 * Account security settings — two-factor authentication card (Sprint 2.1).
 * Optional for non-admin users; admins manage setup via /admin/mfa when forced.
 */
export function SecuritySettings() {
  const t = useTranslations("security");
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
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

  if (!loaded) {
    return <div className="h-28 rounded-2xl bg-[#F4EFE6] animate-pulse" />;
  }

  if (status?.enabled) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-[#0F1416]">{t("statusOnTitle")}</p>
              <p className="mt-1 text-sm text-[#0F1416]/70">{t("statusOnSub")}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#039EA0]/10 px-3 py-1 text-xs font-bold text-[#039EA0]">
              {t("on")}
            </span>
          </div>
          <p className="mt-3 text-sm text-[#0F1416]">
            {t("codesRemaining", { count: status.recoveryCodesRemaining })}
          </p>
        </div>

        {newCodes && (
          <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6">
            <p className="text-base font-semibold text-[#0F1416]">{t("recoveryTitle")}</p>
            <p className="mt-2 text-sm text-[#0F1416]/70">{t("recoveryIntro")}</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#F4EFE6] p-3">
              {newCodes.map((c) => (
                <li key={c} className="font-mono text-sm text-[#0F1416]">
                  {formatRecoveryCode(c)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setNewCodes(null)}
              className="mt-3 w-full px-4 py-2 rounded-xl border border-[#039EA0] text-[#039EA0] font-semibold text-sm"
            >
              {t("savedCodes")}
            </button>
          </div>
        )}

        {panel === "none" && (
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPanel("regenerate")}
              className="px-4 py-2 rounded-xl border border-[#039EA0] text-[#039EA0] font-semibold text-sm"
            >
              {t("regenerate")}
            </button>
            <button
              type="button"
              onClick={() => setPanel("disable")}
              className="px-4 py-2 rounded-xl border border-[#C22] text-[#C22] font-semibold text-sm"
            >
              {t("disable")}
            </button>
          </div>
        )}

        {panel !== "none" && (
          <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6">
            <p className="text-base font-semibold text-[#0F1416]">
              {panel === "disable" ? t("disableTitle") : t("regenerateTitle")}
            </p>
            <p className="mt-2 text-sm text-[#0F1416]/70">
              {panel === "disable" ? t("disableHelp") : t("regenerateHelp")}
            </p>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-[#0F1416]">
                {panel === "disable" ? t("codeOrRecoveryLabel") : t("codeLabel")}
              </span>
              <input
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                placeholder={panel === "disable" ? t("codeOrRecoveryPlaceholder") : "123456"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full px-4 py-3 rounded-xl border border-[#0F1416]/15 focus:outline-none focus:ring-2 focus:ring-[#039EA0]"
              />
            </label>
            {error && <p className="mt-2 text-sm text-[#C22]">{error}</p>}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={resetPanel}
                disabled={busy}
                className="px-4 py-2 rounded-xl border border-[#0F1416]/20 text-[#0F1416] font-semibold text-sm disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={panel === "disable" ? disable : regenerate}
                disabled={busy || !code.trim()}
                className={`px-4 py-2 rounded-xl font-semibold text-sm text-white disabled:opacity-50 ${
                  panel === "disable" ? "bg-[#C22]" : "bg-[#039EA0] hover:bg-[#028688]"
                }`}
              >
                {busy
                  ? t("working")
                  : panel === "disable"
                    ? t("confirmDisable")
                    : t("confirmRegenerate")}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-[#0F1416]/60 leading-relaxed">{t("supportRecoveryNote")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-[#0F1416]">{t("statusOffTitle")}</p>
            <p className="mt-1 text-sm text-[#0F1416]/70">{t("statusOffSub")}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#F4EFE6] px-3 py-1 text-xs font-bold text-[#0F1416]/60">
            {t("off")}
          </span>
        </div>
      </div>
      <TotpEnrolment onDone={() => void load()} />
    </div>
  );
}
