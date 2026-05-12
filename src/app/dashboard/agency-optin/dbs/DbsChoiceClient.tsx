"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BRAND = "#0E7C7B";
const ACCENT = "#F4A261";

const CONSENT_TEXT =
  "By doing this check, you are consenting to your DBS certificate information being shared with All Care 4 U Group Ltd for the purpose of confirming your eligibility to work as a caregiver. You have the right to withdraw consent at any time.";

type Choice = "none" | "update_service" | "fresh";

export default function DbsChoiceClient({
  defaultLegalName,
}: {
  defaultLegalName: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>("none");
  const [legalName, setLegalName] = useState(defaultLegalName);
  const [dob, setDob] = useState("");
  const [certNo, setCertNo] = useState("");
  const [subId, setSubId] = useState("");
  const [workforce, setWorkforce] = useState<"adult" | "child" | "both">("both");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmitUs(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);
    if (!consent) {
      setErr("You must tick the consent box.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agency-optin/dbs-update-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carer_legal_name: legalName,
          date_of_birth: dob,
          certificate_number: certNo,
          subscription_id: subId,
          workforce_type: workforce,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        if (data.action === "changed") {
          setErr(
            data.message ??
              "The Update Service indicates your certificate has changed. Please request a fresh DBS.",
          );
        } else {
          setErr(data.error ?? data.message ?? "Verification failed.");
        }
        return;
      }
      if (data.action === "verified") {
        setSuccess(
          "Verified! Your DBS gate is now green. Next annual check: " +
            new Date(data.next_us_check_due_at).toLocaleDateString(),
        );
        setTimeout(() => router.push("/dashboard/agency-optin"), 1800);
      } else if (data.action === "manual_pending") {
        setSuccess(data.message);
      } else {
        setSuccess("Submitted.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function onRequestFresh() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/agency-optin/request-dbs", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to start fresh DBS.");
        return;
      }
      if (data.action === "redirect" && typeof data.redirect_to === "string") {
        router.push(data.redirect_to);
        return;
      }
      router.push("/dashboard/agency-optin");
    } finally {
      setBusy(false);
    }
  }

  if (choice === "none") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setChoice("update_service")}
          className="w-full text-left p-5 rounded-xl border-2 hover:bg-[#E9F4F4] transition"
          style={{ borderColor: BRAND }}
        >
          <div className="font-bold text-slate-900">
            I have a current DBS on the Update Service
          </div>
          <div className="text-sm text-slate-600 mt-1">
            We&apos;ll verify your status online with your consent — no fresh
            check, no fee. (Save the £40-60 fresh DBS cost.)
          </div>
        </button>
        <button
          type="button"
          onClick={() => setChoice("fresh")}
          className="w-full text-left p-5 rounded-xl border-2 hover:bg-slate-50 transition"
          style={{ borderColor: "#cbd5e1" }}
        >
          <div className="font-bold text-slate-900">I need a new DBS</div>
          <div className="text-sm text-slate-600 mt-1">
            We&apos;ll arrange a fresh Enhanced DBS through Checkr (UK).
          </div>
        </button>
      </div>
    );
  }

  if (choice === "fresh") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          We&apos;ll start a fresh Enhanced DBS via Checkr. You&apos;ll get an
          email with the next steps.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRequestFresh}
            disabled={busy}
            className="px-5 py-3 rounded-full font-semibold text-white disabled:opacity-50"
            style={{ background: BRAND }}
          >
            {busy ? "Starting…" : "Start fresh DBS"}
          </button>
          <button
            type="button"
            onClick={() => setChoice("none")}
            className="px-5 py-3 rounded-full font-semibold text-slate-700 border border-slate-300"
          >
            Back
          </button>
        </div>
        {err && <div className="text-rose-700 text-sm">{err}</div>}
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmitUs}>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Full legal name (as on the certificate)
        </label>
        <input
          required
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Date of birth
        </label>
        <input
          required
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          DBS certificate number (12 digits)
        </label>
        <input
          required
          inputMode="numeric"
          pattern="\d{12}"
          value={certNo}
          onChange={(e) => setCertNo(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Update Service subscription number (12 digits)
        </label>
        <input
          required
          inputMode="numeric"
          pattern="\d{12}"
          value={subId}
          onChange={(e) => setSubId(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Workforce
        </label>
        <select
          value={workforce}
          onChange={(e) =>
            setWorkforce(e.target.value as "adult" | "child" | "both")
          }
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        >
          <option value="both">Adult and child</option>
          <option value="adult">Adult</option>
          <option value="child">Child</option>
        </select>
      </div>
      <div
        className="p-4 rounded-lg border text-sm text-slate-700"
        style={{ borderColor: ACCENT, background: "#FBF1E6" }}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>{CONSENT_TEXT}</span>
        </label>
      </div>
      {err && (
        <div className="text-rose-700 text-sm bg-rose-50 border border-rose-200 rounded-lg p-3">
          {err}
        </div>
      )}
      {success && (
        <div className="text-emerald-800 text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {success}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !consent}
          className="px-5 py-3 rounded-full font-semibold text-white disabled:opacity-50"
          style={{ background: BRAND }}
        >
          {busy ? "Checking…" : "Verify on Update Service"}
        </button>
        <button
          type="button"
          onClick={() => setChoice("none")}
          className="px-5 py-3 rounded-full font-semibold text-slate-700 border border-slate-300"
        >
          Back
        </button>
      </div>
    </form>
  );
}
