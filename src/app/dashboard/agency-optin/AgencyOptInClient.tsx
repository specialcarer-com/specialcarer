"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GatesRow } from "@/lib/agency-optin/server";

const BRAND = "#0E7C7B";
const ACCENT = "#F4A261";

type Props = {
  initialStatus: string;
  initialGates: GatesRow | null;
  rejectedReason: string | null;
  pausedReason: string | null;
  fullName: string;
};

export default function AgencyOptInClient({
  initialStatus,
  initialGates,
  rejectedReason,
  pausedReason,
  fullName,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [gates, setGates] = useState<GatesRow | null>(initialGates);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showContract, setShowContract] = useState(false);
  const [agree, setAgree] = useState(false);
  const [legalName, setLegalName] = useState(fullName);

  async function refresh() {
    const res = await fetch("/api/agency-optin/status", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setStatus(json.status);
      setGates(json.gates);
    }
  }

  async function callJson(path: string, body?: unknown): Promise<{ ok: boolean; data?: Record<string, unknown> }> {
    setErr(null);
    setBusy(path);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Request failed");
        return { ok: false, data };
      }
      return { ok: true, data };
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
      return { ok: false };
    } finally {
      setBusy(null);
    }
  }

  async function onStart() {
    const { ok } = await callJson("/api/agency-optin/start");
    if (ok) await refresh();
  }
  async function onSubmit() {
    const { ok } = await callJson("/api/agency-optin/submit");
    if (ok) {
      await refresh();
      router.refresh();
    }
  }
  async function onSignContract() {
    if (!agree) {
      setErr("Please tick the agreement box");
      return;
    }
    const { ok } = await callJson("/api/agency-optin/sign-contract", {
      signed_by_name: legalName,
      signed_by_role: "Carer",
      agree: true,
    });
    if (ok) {
      setShowContract(false);
      await refresh();
    }
  }
  async function onRequestDbs() {
    // Route to the dual-path DBS chooser (Update Service vs fresh DBS).
    router.push("/dashboard/agency-optin/dbs");
  }
  async function onRequestRtw() {
    const { ok, data } = await callJson("/api/agency-optin/request-rtw-reverify");
    if (ok && data?.action === "redirect" && typeof data.redirect_to === "string") {
      router.push(data.redirect_to);
    } else if (ok) {
      await refresh();
    }
  }
  async function onTogglePopulation(field: "works_with_adults" | "works_with_children", value: boolean) {
    const { ok } = await callJson("/api/agency-optin/population", { [field]: value });
    if (ok) await refresh();
  }

  const isNotStarted = status === "not_started";
  const isInProgress = status === "in_progress";
  const isReady = status === "ready_for_review";
  const isActive = status === "active";
  const isRejected = status === "rejected";
  const isPaused = status === "paused";

  const worksWithAdults = gates?.works_with_adults ?? true;
  const worksWithChildren = gates?.works_with_children ?? false;
  const childApproved = !!gates?.works_with_children_admin_approved_at;
  const inGrace = !!gates?.in_grace_period;
  const graceUntil = gates?.agency_optin_grace_period_until ?? null;
  const graceDaysLeft = graceUntil
    ? Math.max(
        0,
        Math.ceil(
          (new Date(graceUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  return (
    <div className="max-w-3xl mx-auto p-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
        ← Back to dashboard
      </Link>

      <div className="bg-white rounded-2xl mt-3 p-8 shadow-sm border border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Agency opt-in</h1>
            <p className="text-slate-600">
              Take Channel B shifts dispatched by SpecialCarer's organisational clients —
              with guaranteed PAYE pay, holiday pay, and the same vetting you already have.
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        {isActive && inGrace && (
          <div className="mt-6 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <strong className="text-amber-800">
              {graceDaysLeft} day{graceDaysLeft === 1 ? "" : "s"} remaining to complete new mandatory training
            </strong>
            <p className="text-sm text-slate-700 mt-1">
              Compliance policy has expanded. Complete <strong>Food Hygiene</strong> and{" "}
              <strong>Medication Administration</strong> (and Safeguarding Children if you work
              with children) before the grace period ends to keep your agency status.
            </p>
          </div>
        )}

        {isActive && !inGrace && (
          <div className="mt-6 p-4 rounded-xl border" style={{ borderColor: BRAND, background: "#E9F4F4" }}>
            <strong style={{ color: BRAND }}>You're live for agency shifts.</strong>
            <p className="text-sm text-slate-700 mt-1">
              Channel B shifts will appear in your jobs feed alongside marketplace bookings.
            </p>
          </div>
        )}
        {isPaused && (
          <div className="mt-6 p-4 rounded-xl border" style={{ borderColor: ACCENT, background: "#FBF1E6" }}>
            <strong style={{ color: ACCENT }}>Status paused</strong>
            <p className="text-sm text-slate-700 mt-1">
              {pausedReason ?? "Contact support for next steps. Marketplace bookings unaffected."}
            </p>
          </div>
        )}
        {isRejected && (
          <div className="mt-6 p-4 rounded-xl border border-rose-200 bg-rose-50">
            <strong className="text-rose-700">Not approved</strong>
            <p className="text-sm text-slate-700 mt-1">
              {rejectedReason ?? "Address the feedback and start again."}
            </p>
          </div>
        )}
        {isReady && (
          <div className="mt-6 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <strong className="text-amber-800">Pending admin review</strong>
            <p className="text-sm text-slate-700 mt-1">
              All four gates are green. We typically review within 24 hours.
            </p>
          </div>
        )}

        {isNotStarted && (
          <div className="mt-8">
            <button
              type="button"
              onClick={onStart}
              disabled={busy !== null}
              className="px-5 py-3 rounded-full font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              {busy ? "Starting…" : "Start application"}
            </button>
          </div>
        )}

        {(isInProgress || isReady || isActive || isPaused) && gates && (
          <div className="mt-8 space-y-3">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Population of work</h2>
            <div className="p-4 border border-slate-200 rounded-xl space-y-3">
              <p className="text-sm text-slate-600">
                Select the population(s) you want to support. This determines which
                safeguarding course(s) you must complete.
              </p>
              <label className="flex items-start gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={worksWithAdults}
                  disabled={busy !== null}
                  onChange={(e) => onTogglePopulation("works_with_adults", e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong>I want to work with adults</strong>
                  <span className="block text-xs text-slate-500">
                    Requires the Safeguarding Adults course.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={worksWithChildren}
                  disabled={busy !== null}
                  onChange={(e) => onTogglePopulation("works_with_children", e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong>I want to work with children</strong>
                  <span className="block text-xs text-slate-500">
                    Requires admin approval and the Safeguarding Children course.
                  </span>
                </span>
              </label>
              {worksWithChildren && !childApproved && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <strong>Pending admin approval.</strong> Required for child-population
                  safeguarding compliance. Your other gates can progress in the meantime.
                </div>
              )}
              {worksWithChildren && childApproved && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <strong>Child-population approved.</strong> Complete Safeguarding Children to
                  satisfy your training gate.
                </div>
              )}
            </div>

            <h2 className="text-lg font-bold text-slate-900 mb-2 mt-6">Your gates</h2>

            <GateRow
              label="Worker agreement"
              ok={!!gates.contract_ok}
              detail={
                gates.contract_countersigned_at
                  ? `Signed ${fmtDate(gates.contract_countersigned_at)}`
                  : "Read and sign the Limb (b) Worker Agreement"
              }
              cta={
                !gates.contract_ok ? (
                  <button
                    type="button"
                    onClick={() => setShowContract(true)}
                    disabled={busy !== null}
                    className="text-sm font-semibold text-white px-3 py-2 rounded-full disabled:opacity-50"
                    style={{ background: BRAND }}
                  >
                    Open contract
                  </button>
                ) : null
              }
            />

            <GateRow
              label="Enhanced DBS"
              ok={!!gates.dbs_ok}
              detail={
                gates.dbs_cleared_at
                  ? `Last cleared ${fmtDate(gates.dbs_cleared_at)}`
                  : "An Enhanced DBS check is required, issued within the last 12 months"
              }
              cta={
                !gates.dbs_ok ? (
                  <button
                    type="button"
                    onClick={onRequestDbs}
                    disabled={busy !== null}
                    className="text-sm font-semibold text-white px-3 py-2 rounded-full disabled:opacity-50"
                    style={{ background: BRAND }}
                  >
                    {busy === "/api/agency-optin/request-dbs" ? "…" : "Renew now"}
                  </button>
                ) : null
              }
            />

            <GateRow
              label="Right to Work"
              ok={!!gates.rtw_ok}
              detail={
                gates.rtw_cleared_at
                  ? `Last cleared ${fmtDate(gates.rtw_cleared_at)}`
                  : "Right-to-Work re-verification needed (must be valid for at least 60 days)"
              }
              cta={
                !gates.rtw_ok ? (
                  <button
                    type="button"
                    onClick={onRequestRtw}
                    disabled={busy !== null}
                    className="text-sm font-semibold text-white px-3 py-2 rounded-full disabled:opacity-50"
                    style={{ background: BRAND }}
                  >
                    {busy === "/api/agency-optin/request-rtw-reverify" ? "…" : "Re-verify"}
                  </button>
                ) : null
              }
            />

            <GateRow
              label="Mandatory training"
              ok={!!gates.training_ok}
              detail={renderTrainingDetail(gates)}
              cta={
                !gates.training_ok ? (
                  <Link
                    href="/dashboard/training"
                    className="text-sm font-semibold text-white px-3 py-2 rounded-full"
                    style={{ background: BRAND }}
                  >
                    Open training
                  </Link>
                ) : null
              }
            />

            {isInProgress && (
              <div className="pt-4">
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!gates.overall_ready || busy !== null}
                  className="w-full md:w-auto px-6 py-3 rounded-full font-bold text-white disabled:opacity-40"
                  style={{ background: BRAND }}
                >
                  {busy === "/api/agency-optin/submit" ? "Submitting…" : "Submit for review"}
                </button>
                {!gates.overall_ready && (
                  <p className="text-xs text-slate-500 mt-2">
                    All four gates must be green before you can submit.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {err && (
          <div className="mt-4 p-3 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">
            {err}
          </div>
        )}
      </div>

      {showContract && (
        <ContractModal
          legalName={legalName}
          setLegalName={setLegalName}
          agree={agree}
          setAgree={setAgree}
          onCancel={() => setShowContract(false)}
          onSign={onSignContract}
          busy={busy === "/api/agency-optin/sign-contract"}
        />
      )}
    </div>
  );
}

function renderTrainingDetail(g: GatesRow): string {
  const required: string[] = ["Manual Handling", "Infection Control", "Food Hygiene", "Medication"];
  if (g.works_with_adults) required.push("Safeguarding Adults");
  if (g.works_with_children) required.push("Safeguarding Children");
  return `${g.training_passed_count ?? 0}/${g.training_required_count ?? 0} courses complete · ${required.join(" · ")}`;
}

function GateRow({
  label,
  ok,
  detail,
  cta,
}: {
  label: string;
  ok: boolean;
  detail: string;
  cta: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ background: ok ? BRAND : "#CBD5E1" }}
        aria-label={ok ? "complete" : "pending"}
      >
        {ok ? "✓" : ""}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-900">{label}</div>
        <div className="text-sm text-slate-600 truncate">{detail}</div>
      </div>
      {cta}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    not_started: { label: "Not started", bg: "#F1F5F9", fg: "#475569" },
    in_progress: { label: "In progress", bg: "#FEF3C7", fg: "#92400E" },
    ready_for_review: { label: "Awaiting review", bg: "#DBEAFE", fg: "#1E40AF" },
    active: { label: "Active", bg: "#D1FAE5", fg: "#065F46" },
    paused: { label: "Paused", bg: "#FBF1E6", fg: "#9A6212" },
    rejected: { label: "Not approved", bg: "#FFE4E6", fg: "#9F1239" },
  };
  const m = map[status] ?? map.not_started;
  return (
    <span
      className="inline-block text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

function ContractModal({
  legalName,
  setLegalName,
  agree,
  setAgree,
  onCancel,
  onSign,
  busy,
}: {
  legalName: string;
  setLegalName: (v: string) => void;
  agree: boolean;
  setAgree: (v: boolean) => void;
  onCancel: () => void;
  onSign: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Limb (b) Worker Agreement</h2>
          <p className="text-sm text-slate-600 mt-1">
            Read carefully. By signing you confirm you understand and agree.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 text-sm text-slate-700 space-y-3">
          <p>
            <strong>Status.</strong> You are engaged as a Limb (b) worker under Section
            230(3)(b) of the Employment Rights Act 1996. You are not an employee.
          </p>
          <p>
            <strong>Channel B shifts.</strong> All Care 4 U Ltd may offer you shifts sourced
            from organisational clients. You are free to accept or decline any offer. There is
            no mutuality of obligation.
          </p>
          <p>
            <strong>Pay.</strong> For each Channel B shift you accept and complete, you'll be paid
            the rate notified at the time of offer (never below National Living Wage), via PAYE,
            weekly. Holiday pay (12.07%) is rolled-up and paid weekly alongside basic pay.
          </p>
          <p>
            <strong>Marketplace unaffected.</strong> Your Channel A self-employed status with
            families is unchanged.
          </p>
          <p>
            <strong>Compliance.</strong> You must maintain a current Enhanced DBS (within 12
            months), Right to Work (no expiry within 60 days), and complete all mandatory
            training applicable to your population of work (Manual Handling, Infection
            Control, Food Hygiene, Medication Administration, plus Safeguarding Adults
            and/or Safeguarding Children).
          </p>
          <p>
            <strong>Termination.</strong> Either party may terminate on written notice.
          </p>
          <p>
            <strong>Governing law.</strong> England and Wales.
          </p>
        </div>
        <div className="p-6 border-t border-slate-200 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            Full legal name
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="As it appears on your ID"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-1"
            />
            <span>
              I have read and agree to be bound by the Limb (b) Worker Agreement above.
            </span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-full font-semibold text-slate-700 border border-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSign}
              disabled={busy || !agree || legalName.trim().length < 2}
              className="px-5 py-2 rounded-full font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              {busy ? "Signing…" : "Sign agreement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
