"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, TextArea, Dots } from "../../_components/ui";
import { SERVICES } from "@/lib/care/services";
import type { ProfileReadiness } from "@/lib/care/profile";
import { pickInitialStep } from "./initial-step";

type WizardState = {
  display_name: string;
  headline: string;
  bio: string;
  city: string;
  postcode: string;
  country: "GB" | "US";
  services: string[];
  hourly_rate_cents: number | null;
  years_experience: number;
  languages: string[];
  is_published: boolean;
  public_slug: string | null;
};

type Props = {
  initial: WizardState;
  readiness: ProfileReadiness;
};

const STEPS = [
  { id: 1, label: "About you" },
  { id: 2, label: "Services" },
  { id: 3, label: "Rates & location" },
  { id: 4, label: "Vetting" },
  { id: 5, label: "Publish" },
] as const;

export function CarerOnboardingWizardClient({ initial, readiness }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<number>(() =>
    pickInitialStep({ display_name: initial.display_name }, readiness),
  );
  const [state, setState] = useState<WizardState>(initial);
  const [readinessState, setReadinessState] = useState<ProfileReadiness>(readiness);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  async function savePartial(payload: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/caregiver/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        readiness?: ProfileReadiness;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not save. Please try again.");
        return false;
      }
      if (data.readiness) setReadinessState(data.readiness);
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/caregiver/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        upgrade_url?: string;
        public_slug?: string;
      };
      if (res.status === 403 && data.upgrade_url) {
        router.push(data.upgrade_url);
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not publish profile.");
        return;
      }
      // Land the carer on their live profile.
      router.push("/m/profile");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const totalSteps = STEPS.length;

  return (
    <section className="flex-1 flex flex-col px-6 pt-4 pb-6">
      <div className="mb-4">
        <Dots total={totalSteps} current={step - 1} />
        <p className="mt-3 text-[12px] text-subheading">
          Step {step} of {totalSteps} — {STEPS[step - 1].label}
        </p>
      </div>

      {step === 1 && (
        <Step1
          state={state}
          set={set}
          saving={saving}
          error={error}
          onNext={async () => {
            if (!state.display_name.trim()) {
              setError("Please add a display name.");
              return;
            }
            if (state.bio.trim().length < 60) {
              setError("Add a short bio so families can get to know you (60+ chars).");
              return;
            }
            const ok = await savePartial({
              display_name: state.display_name.trim(),
              headline: state.headline.trim(),
              bio: state.bio.trim(),
            });
            if (ok) setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <Step2
          state={state}
          set={set}
          saving={saving}
          error={error}
          onBack={() => setStep(1)}
          onNext={async () => {
            if (state.services.length === 0) {
              setError("Pick at least one service so we can match you.");
              return;
            }
            const ok = await savePartial({
              services: state.services,
              years_experience: Math.max(0, state.years_experience || 0),
            });
            if (ok) setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <Step3
          state={state}
          set={set}
          saving={saving}
          error={error}
          onBack={() => setStep(2)}
          onNext={async () => {
            if (!state.hourly_rate_cents || state.hourly_rate_cents < 1000) {
              setError("Set an hourly rate of at least £10/hr.");
              return;
            }
            if (!state.postcode.trim()) {
              setError("We need your postcode to match nearby families.");
              return;
            }
            const ok = await savePartial({
              hourly_rate_cents: state.hourly_rate_cents,
              currency: state.country === "US" ? "USD" : "GBP",
              city: state.city.trim() || null,
              postcode: state.postcode.trim(),
              country: state.country,
            });
            if (ok) setStep(4);
          }}
        />
      )}

      {step === 4 && (
        <Step4
          readiness={readinessState}
          saving={saving}
          error={error}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}

      {step === 5 && (
        <Step5
          state={state}
          readiness={readinessState}
          saving={saving}
          error={error}
          onBack={() => setStep(4)}
          onPublish={publish}
        />
      )}
    </section>
  );
}

/* ───────────────────────── Step 1: About you ───────────────────────── */
function Step1({
  state,
  set,
  saving,
  error,
  onNext,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  saving: boolean;
  error: string | null;
  onNext: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col gap-4">
      <h1 className="text-[22px] font-bold text-heading">About you</h1>
      <p className="text-[13px] text-subheading">
        This is what families see first. Be warm, be honest, be yourself.
      </p>
      <Input
        label="Display name"
        placeholder="e.g. Priya N."
        value={state.display_name}
        onChange={(e) => set("display_name", e.target.value)}
        maxLength={80}
        autoComplete="name"
      />
      <Input
        label="Headline"
        placeholder="e.g. Live-in carer · 8 years with the elderly"
        value={state.headline}
        onChange={(e) => set("headline", e.target.value)}
        maxLength={120}
        hint="One short line — what makes you, you."
      />
      <TextArea
        label="Short bio"
        placeholder="Why families love working with you. Your style, your strengths, what you specialise in…"
        value={state.bio}
        onChange={(e) => set("bio", e.target.value)}
        maxLength={2000}
        rows={6}
        hint={`${state.bio.length} / 2000`}
      />
      {error && <p className="text-[13px] text-[#C22]">{error}</p>}
      <div className="mt-auto pt-4">
        <Button block onClick={onNext} disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Step 2: Services ───────────────────────── */
function Step2({
  state,
  set,
  saving,
  error,
  onBack,
  onNext,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  function toggleService(key: string) {
    set(
      "services",
      state.services.includes(key)
        ? state.services.filter((s) => s !== key)
        : [...state.services, key],
    );
  }
  return (
    <div className="flex-1 flex flex-col gap-4">
      <h1 className="text-[22px] font-bold text-heading">What care do you provide?</h1>
      <p className="text-[13px] text-subheading">
        Pick everything you do. You can change this any time.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {SERVICES.map((svc) => {
          const selected = state.services.includes(svc.key);
          return (
            <button
              key={svc.key}
              type="button"
              onClick={() => toggleService(svc.key)}
              className={`w-full text-left rounded-btn border px-4 py-3 transition sc-no-select ${
                selected
                  ? "border-primary bg-primary-50"
                  : "border-line bg-white"
              }`}
              aria-pressed={selected}
            >
              <span
                className={`text-[15px] font-semibold ${
                  selected ? "text-primary" : "text-heading"
                }`}
              >
                {svc.label}
              </span>
            </button>
          );
        })}
      </div>
      <Input
        label="Years of experience"
        type="number"
        inputMode="numeric"
        min={0}
        max={60}
        value={state.years_experience}
        onChange={(e) =>
          set("years_experience", Math.max(0, Number(e.target.value) || 0))
        }
      />
      {error && <p className="text-[13px] text-[#C22]">{error}</p>}
      <div className="mt-auto pt-4 flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button block onClick={onNext} disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Step 3: Rates & location ───────────────────────── */
function Step3({
  state,
  set,
  saving,
  error,
  onBack,
  onNext,
}: {
  state: WizardState;
  set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const rateDisplay =
    state.hourly_rate_cents != null
      ? (state.hourly_rate_cents / 100).toFixed(2)
      : "";
  return (
    <div className="flex-1 flex flex-col gap-4">
      <h1 className="text-[22px] font-bold text-heading">Your rate & where you work</h1>
      <p className="text-[13px] text-subheading">
        Most UK carers set £15–£25/hr. You can adjust this later.
      </p>
      <Input
        label="Hourly rate (£)"
        type="number"
        inputMode="decimal"
        min={10}
        max={150}
        step={0.5}
        value={rateDisplay}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          set("hourly_rate_cents", Number.isFinite(v) ? Math.round(v * 100) : null);
        }}
        hint="In pounds per hour. Minimum £10/hr."
      />
      <Input
        label="City"
        placeholder="e.g. London"
        value={state.city}
        onChange={(e) => set("city", e.target.value)}
      />
      <Input
        label="Postcode"
        placeholder="e.g. SW1A 1AA"
        value={state.postcode}
        onChange={(e) => set("postcode", e.target.value.toUpperCase())}
        maxLength={10}
        hint="We use this to match nearby families. Never shown publicly."
      />
      {error && <p className="text-[13px] text-[#C22]">{error}</p>}
      <div className="mt-auto pt-4 flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button block onClick={onNext} disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Step 4: Vetting ───────────────────────── */
function Step4({
  readiness,
  saving,
  error,
  onBack,
  onNext,
}: {
  readiness: ProfileReadiness;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col gap-4">
      <h1 className="text-[22px] font-bold text-heading">Background checks</h1>
      <p className="text-[13px] text-subheading">
        Every SpecialCarer carer is vetted before publishing. We&rsquo;ll guide
        you through each step — most carers finish in 1–5 days.
      </p>

      <VettingRow
        label="Enhanced DBS"
        status={readiness.bgChecksCleared ? "done" : "todo"}
        href="/m/dbs"
      />
      <VettingRow
        label="Right to work"
        status={
          readiness.missingChecks?.includes("right_to_work") ? "todo" : "done"
        }
        href="/m/profile/vetting"
      />
      <VettingRow
        label="Digital ID"
        status={
          readiness.missingChecks?.includes("digital_id") ? "todo" : "done"
        }
        href="/m/profile/vetting"
      />

      <p className="mt-3 text-[12px] text-subheading">
        Already started? Your progress is saved — you can leave and come back
        any time.
      </p>

      {error && <p className="text-[13px] text-[#C22]">{error}</p>}
      <div className="mt-auto pt-4 flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button block onClick={onNext} disabled={saving}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function VettingRow({
  label,
  status,
  href,
}: {
  label: string;
  status: "done" | "todo";
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-btn border bg-white px-4 py-3 transition sc-no-select ${
        status === "done" ? "border-primary/40" : "border-line"
      }`}
    >
      <span className="text-[15px] font-semibold text-heading">{label}</span>
      <span
        className={`text-[12px] font-bold uppercase tracking-wide ${
          status === "done" ? "text-primary" : "text-secondary"
        }`}
      >
        {status === "done" ? "Cleared" : "Start"}
      </span>
    </Link>
  );
}

/* ───────────────────────── Step 5: Publish ───────────────────────── */
function Step5({
  state,
  readiness,
  saving,
  error,
  onBack,
  onPublish,
}: {
  state: WizardState;
  readiness: ProfileReadiness;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onPublish: () => void;
}) {
  const checklist = useMemo(
    () => [
      { label: "Display name", ok: readiness.hasName },
      { label: "Bio", ok: readiness.hasBio },
      { label: "Service", ok: readiness.hasService },
      { label: "Care format", ok: readiness.hasFormat },
      { label: "Hourly rate", ok: readiness.hasRate },
      { label: "Location", ok: readiness.hasLocation },
      { label: "Background checks", ok: readiness.bgChecksCleared },
    ],
    [readiness],
  );

  const allReady = readiness.isPublishable;

  return (
    <div className="flex-1 flex flex-col gap-4">
      <h1 className="text-[22px] font-bold text-heading">Ready to go live?</h1>
      <p className="text-[13px] text-subheading">
        Publishing makes your profile visible to families across the UK. You
        can pause or unpublish at any time.
      </p>

      <ul className="rounded-btn border border-line bg-white divide-y divide-line">
        {checklist.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="text-[14px] font-semibold text-heading">
              {item.label}
            </span>
            <span
              className={`text-[12px] font-bold uppercase tracking-wide ${
                item.ok ? "text-primary" : "text-secondary"
              }`}
            >
              {item.ok ? "Ready" : "Pending"}
            </span>
          </li>
        ))}
      </ul>

      {!allReady && (
        <p className="text-[12px] text-subheading">
          Finish the pending items above before you can go live.
        </p>
      )}

      {!state.is_published && (
        <div className="rounded-btn bg-primary-50 border border-primary/30 p-4">
          <p className="text-[13px] font-semibold text-primary">
            Founder rate — £4.99/month
          </p>
          <p className="mt-1 text-[12px] text-subheading">
            Publishing requires an active Founder Membership. The first 1,000
            carers lock this rate for life.
          </p>
        </div>
      )}

      {error && <p className="text-[13px] text-[#C22]">{error}</p>}

      <div className="mt-auto pt-4 flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button block onClick={onPublish} disabled={!allReady || saving}>
          {saving ? "Publishing…" : "Publish my profile"}
        </Button>
      </div>
    </div>
  );
}


