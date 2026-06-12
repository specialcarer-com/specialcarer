"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Input } from "../../_components/ui";
import { formatRecoveryCode } from "@/lib/security/recovery-codes";
import type { EnrolResponse } from "@/app/api/m/security/2fa/enrol/route";
import type { VerifyResponse } from "@/app/api/m/security/2fa/verify/route";

type Step = "intro" | "scan" | "codes";

/**
 * TOTP enrolment flow (gap 13), shared by the Security settings page and the
 * "2FA required to continue" gate. Walks: intro → scan QR + verify → show
 * recovery codes once. Calls onDone() after the user confirms they've saved
 * the recovery codes.
 */
export function Enrolment({ onDone }: { onDone: () => void }) {
  const t = useTranslations("security");
  const [step, setStep] = useState<Step>("intro");
  const [enrol, setEnrol] = useState<EnrolResponse | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealSecret, setRevealSecret] = useState(false);

  async function begin() {
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
      setEnrol((await res.json()) as EnrolResponse);
      setStep("scan");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!enrol) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/m/security/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ factorId: enrol.factorId, code: code.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(res.status === 429 ? t("rateLimited") : j.error || t("codeMismatch"));
        return;
      }
      const j = (await res.json()) as VerifyResponse;
      setCodes(j.recoveryCodes);
      setStep("codes");
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    void navigator.clipboard?.writeText(codes.map(formatRecoveryCode).join("\n"));
  }

  function downloadCodes() {
    const blob = new Blob(
      [
        `${t("recoveryFileHeader")}\n\n${codes.map(formatRecoveryCode).join("\n")}\n`,
      ],
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
      <Card>
        <p className="text-[14px] font-bold text-heading mb-1">{t("enableTitle")}</p>
        <p className="text-[12.5px] text-subheading mb-3 leading-snug">
          {t("enableIntro")}
        </p>
        {error && <p className="mb-3 text-[12.5px] text-[#C22]">{error}</p>}
        <Button size="sm" block onClick={begin} disabled={busy}>
          {busy ? t("starting") : t("enable")}
        </Button>
      </Card>
    );
  }

  if (step === "scan" && enrol) {
    return (
      <Card>
        <p className="text-[14px] font-bold text-heading mb-1">{t("scanTitle")}</p>
        <p className="text-[12.5px] text-subheading mb-3 leading-snug">
          {t("scanHelp")}
        </p>
        <div className="flex justify-center">
          {/* Supabase returns the QR as an SVG data URL. */}
          <Image
            src={enrol.qrCode}
            alt={t("qrAlt")}
            width={196}
            height={196}
            unoptimized
            className="rounded-card border border-line bg-white p-2"
          />
        </div>

        <button
          type="button"
          onClick={() => setRevealSecret((v) => !v)}
          className="mt-3 w-full text-center text-[12px] font-semibold text-primary"
        >
          {revealSecret ? t("hideSecret") : t("cantScan")}
        </button>
        {revealSecret && (
          <p className="mt-2 break-all rounded-btn bg-muted px-3 py-2 text-center font-mono text-[12.5px] text-heading">
            {enrol.secret}
          </p>
        )}

        <div className="mt-4">
          <Input
            label={t("codeLabel")}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {error && <p className="mt-2 text-[12.5px] text-[#C22]">{error}</p>}
        <div className="mt-4">
          <Button size="sm" block onClick={verify} disabled={busy || !code.trim()}>
            {busy ? t("verifying") : t("verifyAndEnable")}
          </Button>
        </div>
      </Card>
    );
  }

  // step === "codes"
  return (
    <Card>
      <p className="text-[14px] font-bold text-heading mb-1">{t("recoveryTitle")}</p>
      <p className="text-[12.5px] text-subheading mb-3 leading-snug">
        {t("recoveryIntro")}
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-card bg-muted p-3">
        {codes.map((c) => (
          <li key={c} className="font-mono text-[13px] text-heading tracking-tight">
            {formatRecoveryCode(c)}
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={copyCodes}>
          {t("copy")}
        </Button>
        <Button size="sm" variant="outline" onClick={downloadCodes}>
          {t("download")}
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] text-subheading leading-relaxed">
        {t("recoveryWarning")}
      </p>
      <div className="mt-3">
        <Button size="sm" block onClick={onDone}>
          {t("savedCodes")}
        </Button>
      </div>
    </Card>
  );
}
