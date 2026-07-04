"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { sanitiseTotpCode } from "@/lib/security/mfa-gate";
import type { EnrolResponse } from "@/app/api/m/security/2fa/enrol/route";
import type { VerifyResponse } from "@/app/api/m/security/2fa/verify/route";
import { formatRecoveryCode } from "@/lib/security/recovery-codes";

type Step = "intro" | "scan" | "codes";

type Props = {
  onDone: () => void;
  /** When true, show copy that MFA is mandatory (admin forced setup). */
  required?: boolean;
};

/**
 * Web TOTP enrolment wizard (Sprint 2.1). Uses Supabase native MFA via the
 * existing enrol/verify API routes (server-side wrappers around mfa.enroll,
 * mfa.challenge, mfa.verify).
 */
export function TotpEnrolment({ onDone, required = false }: Props) {
  const t = useTranslations("security");
  const [step, setStep] = useState<Step>("intro");
  const [enrol, setEnrol] = useState<EnrolResponse | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealSecret, setRevealSecret] = useState(false);
  const enrolledRef = useRef(false);

  async function begin() {
    if (enrolledRef.current) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/m/security/2fa/enrol", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setError(t("enrolError"));
        return;
      }
      const body = (await res.json()) as EnrolResponse;
      enrolledRef.current = true;
      setEnrol(body);
      setStep("scan");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!enrol) return;
    const sanitised = sanitiseTotpCode(code);
    if (!sanitised) {
      setError(t("codeMismatch"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/m/security/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ factorId: enrol.factorId, code: sanitised }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(res.status === 429 ? t("rateLimited") : j.error || t("codeMismatch"));
        return;
      }
      const j = (await res.json()) as VerifyResponse;
      setCodes(j.recoveryCodes);
      setStep("codes");
      const supabase = createClient();
      await supabase.auth.refreshSession();
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    void navigator.clipboard?.writeText(codes.map(formatRecoveryCode).join("\n"));
  }

  function downloadCodes() {
    const blob = new Blob(
      [`${t("recoveryFileHeader")}\n\n${codes.map(formatRecoveryCode).join("\n")}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "specialcarer-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (step === "intro") {
    return (
      <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6">
        {required && (
          <p className="mb-3 text-sm font-semibold text-[#0F1416]">{t("requiredTitle")}</p>
        )}
        <p className="text-base font-semibold text-[#0F1416]">{t("enableTitle")}</p>
        <p className="mt-2 text-sm text-[#0F1416]/70 leading-relaxed">
          {required ? t("requiredIntro") : t("enableIntro")}
        </p>
        {error && (
          <p className="mt-3 text-sm text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void begin()}
          disabled={busy}
          className="mt-4 w-full px-4 py-3 rounded-xl bg-[#039EA0] text-white font-semibold hover:bg-[#028688] transition disabled:opacity-50"
        >
          {busy ? t("starting") : t("enable")}
        </button>
      </div>
    );
  }

  if (step === "scan" && enrol) {
    return (
      <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6">
        <p className="text-base font-semibold text-[#0F1416]">{t("scanTitle")}</p>
        <p className="mt-2 text-sm text-[#0F1416]/70 leading-relaxed">{t("scanHelp")}</p>
        <div className="mt-4 flex justify-center">
          <Image
            src={enrol.qrCode}
            alt={t("qrAlt")}
            width={196}
            height={196}
            unoptimized
            className="rounded-xl border border-[#0F1416]/10 bg-white p-2"
          />
        </div>
        <button
          type="button"
          onClick={() => setRevealSecret((v) => !v)}
          className="mt-3 w-full text-center text-sm font-semibold text-[#039EA0]"
        >
          {revealSecret ? t("hideSecret") : t("cantScan")}
        </button>
        {revealSecret && (
          <p className="mt-2 break-all rounded-xl bg-[#F4EFE6] px-3 py-2 text-center font-mono text-sm text-[#0F1416]">
            {enrol.secret}
          </p>
        )}
        {enrol.uri && revealSecret && (
          <p className="mt-2 break-all text-xs text-[#0F1416]/60">{enrol.uri}</p>
        )}
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#0F1416]">{t("codeLabel")}</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-1 w-full px-4 py-3 rounded-xl border border-[#0F1416]/15 focus:outline-none focus:ring-2 focus:ring-[#039EA0] text-center text-2xl tracking-[0.4em] font-mono"
          />
        </label>
        {error && (
          <p className="mt-3 text-sm text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void verify()}
          disabled={busy || code.length < 6}
          className="mt-4 w-full px-4 py-3 rounded-xl bg-[#039EA0] text-white font-semibold hover:bg-[#028688] transition disabled:opacity-50"
        >
          {busy ? t("verifying") : t("verifyAndEnable")}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#0F1416]/10 bg-white p-6">
      <p className="text-base font-semibold text-[#0F1416]">{t("recoveryTitle")}</p>
      <p className="mt-2 text-sm text-[#0F1416]/70 leading-relaxed">{t("recoveryIntro")}</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#F4EFE6] p-3">
        {codes.map((c) => (
          <li key={c} className="font-mono text-sm text-[#0F1416]">
            {formatRecoveryCode(c)}
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copyCodes}
          className="px-4 py-2 rounded-xl border border-[#039EA0] text-[#039EA0] font-semibold text-sm"
        >
          {t("copy")}
        </button>
        <button
          type="button"
          onClick={downloadCodes}
          className="px-4 py-2 rounded-xl border border-[#039EA0] text-[#039EA0] font-semibold text-sm"
        >
          {t("download")}
        </button>
      </div>
      <p className="mt-3 text-xs text-[#0F1416]/60 leading-relaxed">{t("recoveryWarning")}</p>
      <button
        type="button"
        onClick={onDone}
        className="mt-4 w-full px-4 py-3 rounded-xl bg-[#039EA0] text-white font-semibold hover:bg-[#028688] transition"
      >
        {t("savedCodes")}
      </button>
    </div>
  );
}
