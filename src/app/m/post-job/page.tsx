"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  TopBar,
  Button,
  Input,
  TextArea,
  IconCheck,
} from "../_components/ui";
import { SERVICE_DESCRIPTION, SERVICE_LABEL, type Caregiver } from "../_lib/mock";

type ServiceKey = Caregiver["services"][number];

type FormState = {
  service: ServiceKey | null;
  title: string;
  description: string;
  city: string;
  startDate: string;
  hoursPerWeek: string;
  rateGbp: string;
  rateUsd: string;
  requirements: string[];
};

const REQ_OPTIONS = [
  "DBS Enhanced",
  "First Aid",
  "Pediatric First Aid",
  "Manual Handling",
  "Driving licence",
  "Non-smoker",
  "SEN experience",
  "Maternity Nurse cert",
  "Min 3 yrs experience",
];

const STEPS = [
  "Service",
  "Details",
  "Schedule",
  "Pay & requirements",
  "Review",
];

export default function PostJobPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState<FormState>({
    service: null,
    title: "",
    description: "",
    city: "",
    startDate: "",
    hoursPerWeek: "",
    rateGbp: "",
    rateUsd: "",
    requirements: [],
  });

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function toggleReq(r: string) {
    setForm((p) =>
      p.requirements.includes(r)
        ? { ...p, requirements: p.requirements.filter((x) => x !== r) }
        : { ...p, requirements: [...p.requirements, r] }
    );
  }

  const canNext = (() => {
    if (step === 0) return form.service !== null;
    if (step === 1) return form.title.length >= 3 && form.description.length >= 10;
    if (step === 2) return form.city.length > 1 && form.startDate.length > 0 && form.hoursPerWeek.length > 0;
    if (step === 3) return form.rateGbp !== "" && form.rateUsd !== "";
    return true;
  })();

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else void publish();
  }

  // Mock-vertical → canonical SpecialCarer service vertical.
  // Keep aligned with the 5 canonical verticals (child=childcare,
  // elderly=elderly_care, special=special_needs, postnatal, complex=complex_care).
  const SERVICE_TO_CANONICAL: Record<string, string> = {
    child: "childcare",
    elderly: "elderly_care",
    special: "special_needs",
    postnatal: "postnatal",
    complex: "complex_care",
  };

  async function publish() {
    if (!form.service) return;
    const canonical = SERVICE_TO_CANONICAL[form.service] ?? form.service;
    // The form captures one date + an hours/week duration. For a v1
    // single-shift request we treat that duration as a one-shot length
    // starting at 09:00 local on the given date.
    const startsAt = new Date(`${form.startDate}T09:00:00`);
    const durationHours = Math.max(1, Math.min(24, Number(form.hoursPerWeek) || 1));
    const endsAt = new Date(startsAt.getTime() + durationHours * 3600_000);

    // The seeker fills both a GBP and USD rate in the existing form.
    // We submit one request in the rate that matches their account
    // country — fall back to GBP if neither feels right.
    const rateGbp = Number(form.rateGbp);
    const rateUsd = Number(form.rateUsd);
    const useUsd = !rateGbp && rateUsd > 0;
    const ratePounds = useUsd ? rateUsd : rateGbp;
    const hourly_rate_cents = Math.round(ratePounds * 100);
    const currency: "gbp" | "usd" = useUsd ? "usd" : "gbp";
    const country: "GB" | "US" = useUsd ? "US" : "GB";

    const notes = [
      form.title.trim() ? `**${form.title.trim()}**` : null,
      form.description.trim(),
      form.requirements.length > 0
        ? `Requirements: ${form.requirements.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const res = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_type: canonical,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          hourly_rate_cents,
          currency,
          location_city: form.city.trim() || null,
          location_country: country,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        // Surface the error inline rather than blowing up — the user
        // can correct and retry without losing their inputs.
        alert(j.error ?? "Couldn't publish your job. Please try again.");
        return;
      }
    } catch {
      alert("Network error. Please try again.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/m/bookings"), 1400);
  }

  if (done) {
    return (
      <div className="min-h-screen bg-bg-screen sc-safe-top sc-safe-bottom flex flex-col items-center justify-center px-6 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-primary-50 text-primary">
          <IconCheck />
        </div>
        <h1 className="mt-5 text-[22px] font-bold text-heading">Job posted</h1>
        <p className="mt-2 text-[14px] text-subheading">
          We'll start matching you with carers right away.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar
        title={`Step ${step + 1} of ${STEPS.length}`}
        back={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
      />

      {/* Progress */}
      <div className="px-5">
        <div className="flex h-1.5 gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-[18px] font-bold text-heading">{STEPS[step]}</p>
      </div>

      <div className="px-5 pt-4">
        {step === 0 && (
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(SERVICE_LABEL) as ServiceKey[]).map((s) => (
              <button
                key={s}
                onClick={() => update("service", s)}
                className={`rounded-card border-2 p-4 text-left transition ${
                  form.service === s
                    ? "border-primary bg-primary-50"
                    : "border-line bg-white"
                }`}
              >
                <p className="text-[15px] font-bold text-heading">
                  {SERVICE_LABEL[s]}
                </p>
                <p className="mt-1 text-[12px] text-subheading">
                  {SERVICE_DESCRIPTION[s]}
                </p>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <Input
              label="Job title"
              placeholder="e.g. Afternoon child carer needed"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
            <TextArea
              label="Description"
              rows={6}
              placeholder="Tell carers about your family, what a typical day looks like, and anything important."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <Input
              label="City / Area"
              placeholder="e.g. Camden, London"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
            <Input
              label="Start date"
              placeholder="e.g. Mon 11 May or ASAP"
              value={form.startDate}
              onChange={(e) => update("startDate", e.target.value)}
            />
            <Input
              label="Hours per week"
              placeholder="e.g. 12-15 hrs/week"
              value={form.hoursPerWeek}
              onChange={(e) => update("hoursPerWeek", e.target.value)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Rate (£/hr)"
                inputMode="numeric"
                placeholder="22"
                value={form.rateGbp}
                onChange={(e) => update("rateGbp", e.target.value.replace(/[^\d]/g, ""))}
              />
              <Input
                label="Rate ($/hr)"
                inputMode="numeric"
                placeholder="28"
                value={form.rateUsd}
                onChange={(e) => update("rateUsd", e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
            <div>
              <p className="mb-2 text-[14px] font-semibold text-heading">Requirements</p>
              <div className="flex flex-wrap gap-2">
                {REQ_OPTIONS.map((r) => {
                  const on = form.requirements.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => toggleReq(r)}
                      className={`rounded-pill px-3 py-2 text-[13px] font-semibold transition ${
                        on
                          ? "bg-primary text-white"
                          : "bg-white text-subheading shadow-card"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3">
            <Row label="Service" value={form.service ? SERVICE_LABEL[form.service] : "—"} />
            <Row label="Title" value={form.title || "—"} />
            <Row label="City" value={form.city || "—"} />
            <Row label="Start" value={form.startDate || "—"} />
            <Row label="Hours" value={form.hoursPerWeek || "—"} />
            <Row label="Rate" value={`£${form.rateGbp || "—"}/hr · $${form.rateUsd || "—"}/hr`} />
            <Row
              label="Requirements"
              value={form.requirements.length ? form.requirements.join(", ") : "None specified"}
            />
            <div className="rounded-card bg-white p-4 shadow-card">
              <p className="text-[12px] uppercase tracking-wide text-subheading">Description</p>
              <p className="mt-1 text-[14px] text-heading whitespace-pre-wrap">
                {form.description || "—"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block disabled={!canNext} onClick={next}>
          {step === STEPS.length - 1 ? "Publish job" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-card bg-white p-4 shadow-card">
      <p className="text-[12px] uppercase tracking-wide text-subheading">{label}</p>
      <p className="max-w-[60%] text-right text-[14px] font-semibold text-heading">{value}</p>
    </div>
  );
}
