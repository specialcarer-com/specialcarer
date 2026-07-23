"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  TextArea,
  Card,
  Tag,
  Dots,
} from "../../../../_components/ui";
import {
  CARE_CATEGORIES,
  CARE_CATEGORY_LABEL,
  SHIFT_MODE_LABEL,
  SHIFT_MODE_DESCRIPTION,
  SLEEP_IN_ORG_CHARGE_DEFAULT,
  SLEEP_IN_CARER_PAY_DEFAULT,
  sleepInNeedsWarning,
  type CareCategory,
  type ShiftMode,
  type ServiceUser,
  type BookingWizardValues,
} from "@/lib/org/booking-types";

// ── Step labels ───────────────────────────────────────────────────────────────
const STEPS = [
  "Service user",
  "Shift type",
  "Date & time",
  "Care needs",
  "Carer",
  "Review",
] as const;

const DEFAULT_RATE_PENCE = 1800; // £18/hr default

type Props = {
  serviceUsers: ServiceUser[];
  bookerName: string;
  bookerRole: string;
};

export default function BookingWizard({ serviceUsers, bookerName, bookerRole }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [values, setValues] = useState<BookingWizardValues>({
    service_user_id: "",
    shift_mode: "single",
    starts_at: "",
    ends_at: "",
    active_hours_start: "07:00",
    active_hours_end: "22:00",
    sleep_in_org_charge: SLEEP_IN_ORG_CHARGE_DEFAULT,
    sleep_in_carer_pay: SLEEP_IN_CARER_PAY_DEFAULT,
    recurrence_days_of_week: [1, 2, 3, 4, 5], // Mon–Fri default
    recurrence_start_date: "",
    required_categories: [],
    required_skills: [],
    preferred_carer_id: "",
    broadcast: false,
    booker_name: bookerName,
    booker_role: bookerRole,
    notes: "",
  });

  const [hourlyRate, setHourlyRate] = useState(DEFAULT_RATE_PENCE);

  function set<K extends keyof BookingWizardValues>(
    key: K,
    val: BookingWizardValues[K]
  ) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  // ── Step validation ─────────────────────────────────────────────────────────
  function canProceed(): boolean {
    switch (step) {
      case 0: return !!values.service_user_id;
      case 1: return !!values.shift_mode;
      case 2:
        if (values.shift_mode === "recurring_4w") {
          return !!values.recurrence_start_date && values.recurrence_days_of_week.length > 0;
        }
        return !!values.starts_at && !!values.ends_at;
      case 3: return true;
      case 4: return true;
      case 5: return !!values.booker_name;
      default: return true;
    }
  }

  // ── Computed preview values ─────────────────────────────────────────────────
  function activeHours(): number {
    if (!values.starts_at || !values.ends_at) return 0;
    return Math.max(
      0,
      (new Date(values.ends_at).getTime() - new Date(values.starts_at).getTime()) /
        3600000
    );
  }

  function orgChargePreview(): number {
    const activeCents = activeHours() * hourlyRate;
    if (values.shift_mode === "sleep_in") {
      return activeCents + values.sleep_in_org_charge * 100;
    }
    return activeCents;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/m/org/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          hourly_rate_cents: hourlyRate,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Booking failed");
      }
      router.push("/m/org/bookings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Selected service user ────────────────────────────────────────────────────
  const selectedSU = serviceUsers.find((s) => s.id === values.service_user_id);

  // ── Sleep-in warning ────────────────────────────────────────────────────────
  const sleepWarn = sleepInNeedsWarning(
    values.sleep_in_org_charge,
    values.sleep_in_carer_pay
  );

  return (
    <div className="pb-10">
      {/* Progress dots */}
      <div className="mb-6">
        <Dots total={STEPS.length} current={step} />
        <p className="text-center text-[13px] text-subheading mt-2">
          Step {step + 1} of {STEPS.length}: <strong>{STEPS[step]}</strong>
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-card bg-rose-50 border border-rose-200 p-3">
          <p className="text-[13px] text-rose-800">{error}</p>
        </div>
      )}

      {/* ── Step 0: Service user ─────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-3">
          <p className="text-[14px] font-semibold text-heading">
            Who is this booking for?
          </p>
          {serviceUsers.length === 0 && (
            <Card className="p-4">
              <p className="text-[13px] text-subheading">
                No service users yet.{" "}
                <a href="/m/org/service-users/new" className="text-primary font-semibold underline">
                  Add one first
                </a>
                .
              </p>
            </Card>
          )}
          <div className="space-y-2">
            {serviceUsers.map((su) => (
              <button
                key={su.id}
                type="button"
                onClick={() => set("service_user_id", su.id)}
                className={`w-full text-left rounded-card border p-4 transition
                  ${values.service_user_id === su.id
                    ? "border-primary bg-primary-50"
                    : "border-line bg-white"
                  }`}
              >
                <p className="text-[14px] font-semibold text-heading">
                  {su.full_name}
                </p>
                {su.city && (
                  <p className="text-[12px] text-subheading">{su.city}</p>
                )}
                {su.care_categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {su.care_categories.map((c) => (
                      <Tag key={c} tone="neutral">
                        {CARE_CATEGORY_LABEL[c as CareCategory] ?? c}
                      </Tag>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 1: Shift mode ───────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-[14px] font-semibold text-heading">
            What type of shift is this?
          </p>
          {(["single", "twelve_hour", "sleep_in", "recurring_4w"] as ShiftMode[]).map(
            (mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => set("shift_mode", mode)}
                className={`w-full text-left rounded-card border p-4 transition
                  ${values.shift_mode === mode
                    ? "border-primary bg-primary-50"
                    : "border-line bg-white"
                  }`}
              >
                <p className="text-[14px] font-semibold text-heading">
                  {SHIFT_MODE_LABEL[mode]}
                </p>
                <p className="text-[12px] text-subheading mt-0.5">
                  {SHIFT_MODE_DESCRIPTION[mode]}
                </p>
              </button>
            )
          )}
        </div>
      )}

      {/* ── Step 2: Date & time ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {values.shift_mode !== "recurring_4w" ? (
            <>
              <Input
                label="Start"
                type="datetime-local"
                value={values.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
              />
              <Input
                label="End"
                type="datetime-local"
                value={values.ends_at}
                onChange={(e) => set("ends_at", e.target.value)}
              />
              {values.shift_mode === "sleep_in" && (
                <>
                  <p className="text-[13px] text-subheading font-medium">
                    Active care window (full rate)
                  </p>
                  <div className="flex gap-3">
                    <Input
                      label="Active from"
                      type="time"
                      value={values.active_hours_start}
                      onChange={(e) => set("active_hours_start", e.target.value)}
                    />
                    <Input
                      label="Active until"
                      type="time"
                      value={values.active_hours_end}
                      onChange={(e) => set("active_hours_end", e.target.value)}
                    />
                  </div>

                  {/* Sleep-in allowance fields with tooltip */}
                  <div className="rounded-card bg-blue-50 border border-blue-200 p-3 text-[13px] text-blue-900 space-y-1">
                    <p className="font-semibold">Sleep-in allowance breakdown</p>
                    <p>
                      The carer receives a flat allowance for the sleeping
                      period in addition to the active-hours rate.
                    </p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      <li>
                        <strong>Org charged</strong> (invoice line item):
                        &ldquo;Sleep-in allowance: £{values.sleep_in_org_charge.toFixed(2)}&rdquo;
                      </li>
                      <li>
                        <strong>Carer earns</strong> for sleeping hours: £{values.sleep_in_carer_pay.toFixed(2)}
                      </li>
                    </ul>
                    <p className="mt-1 text-[11px] text-blue-700">
                      The difference is retained by{" "}
                      <strong>All Care 4 U Group Ltd</strong> to cover
                      on-call escalation, insurance, and compliance costs
                      associated with sleep-in duties.
                    </p>
                  </div>

                  {sleepWarn.warn && (
                    <div className="rounded-card bg-amber-50 border border-amber-200 p-3">
                      <p className="text-[13px] text-amber-800">{sleepWarn.message}</p>
                    </div>
                  )}

                  <Input
                    label="Org charge for sleep period (£)"
                    type="number"
                    min={0}
                    step={5}
                    value={values.sleep_in_org_charge}
                    onChange={(e) =>
                      set("sleep_in_org_charge", parseFloat(e.target.value) || 0)
                    }
                    hint="Invoiced to your organisation. Default £100."
                  />
                  <Input
                    label="Carer pay for sleep period (£)"
                    type="number"
                    min={0}
                    step={5}
                    value={values.sleep_in_carer_pay}
                    onChange={(e) =>
                      set("sleep_in_carer_pay", parseFloat(e.target.value) || 0)
                    }
                    hint="Paid to the carer. Default £50. Platform retains the difference."
                  />
                </>
              )}
            </>
          ) : (
            // Recurring_4w
            <>
              <Input
                label="Pattern start date"
                type="date"
                value={values.recurrence_start_date}
                onChange={(e) => set("recurrence_start_date", e.target.value)}
              />
              <Input
                label="Shift start time"
                type="time"
                value={values.starts_at ? values.starts_at.slice(11, 16) : "20:00"}
                onChange={(e) => {
                  const t = e.target.value;
                  const d = values.recurrence_start_date || new Date().toISOString().slice(0, 10);
                  set("starts_at", `${d}T${t}`);
                }}
              />
              <Input
                label="Shift end time (next day)"
                type="time"
                value={values.ends_at ? values.ends_at.slice(11, 16) : "08:00"}
                onChange={(e) => {
                  const t = e.target.value;
                  const d = values.recurrence_start_date || new Date().toISOString().slice(0, 10);
                  set("ends_at", `${d}T${t}`);
                }}
              />
              <div>
                <label className="block text-[14px] font-semibold text-heading mb-2">
                  Days of week
                </label>
                <div className="flex gap-2 flex-wrap">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day, i) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const current = values.recurrence_days_of_week;
                          set(
                            "recurrence_days_of_week",
                            current.includes(i)
                              ? current.filter((d) => d !== i)
                              : [...current, i]
                          );
                        }}
                        className={`w-12 h-10 rounded-pill text-[13px] font-semibold border transition
                          ${values.recurrence_days_of_week.includes(i)
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-heading border-line"
                          }`}
                      >
                        {day}
                      </button>
                    )
                  )}
                </div>
                <p className="text-[12px] text-subheading mt-1.5">
                  28 shift instances will be created from the start date.
                </p>
              </div>
            </>
          )}

          <Input
            label="Hourly rate (£)"
            type="number"
            min={10}
            step={0.5}
            value={hourlyRate / 100}
            onChange={(e) => setHourlyRate(Math.round(parseFloat(e.target.value) * 100) || DEFAULT_RATE_PENCE)}
            hint="This is the rate the carer will see on their offer."
          />

          {activeHours() > 0 && (
            <Card className="p-3 bg-slate-50">
              <p className="text-[13px] font-semibold text-heading">
                Estimated org charge
              </p>
              <p className="text-[20px] font-bold text-primary mt-0.5">
                £{(orgChargePreview() / 100).toFixed(2)}
              </p>
              {values.shift_mode === "sleep_in" && (
                <div className="text-[12px] text-subheading mt-1 space-y-0.5">
                  <p>
                    Active care: {activeHours().toFixed(1)} hrs @ £{(hourlyRate / 100).toFixed(2)}/hr
                    = £{((activeHours() * hourlyRate) / 100).toFixed(2)}
                  </p>
                  <p>
                    Sleep-in allowance: £{values.sleep_in_org_charge.toFixed(2)}
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── Step 3: Care needs / categories ──────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[14px] font-semibold text-heading mb-2">
              Required care categories
            </label>
            <div className="flex flex-wrap gap-2">
              {CARE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    const current = values.required_categories;
                    set(
                      "required_categories",
                      current.includes(cat)
                        ? current.filter((c) => c !== cat)
                        : [...current, cat]
                    );
                  }}
                  className={`px-3 py-1.5 rounded-pill text-[13px] font-semibold border transition
                    ${values.required_categories.includes(cat)
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-heading border-line"
                    }`}
                >
                  {CARE_CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>
          </div>
          <TextArea
            label="Additional notes for the carer"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            hint="Anything the carer should know before accepting."
            placeholder="Access instructions, parking, specific tasks..."
          />
        </div>
      )}

      {/* ── Step 4: Preferred carer ───────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <p className="text-[13px] text-subheading">
            Optionally target a specific verified carer. Leave blank to send to
            the best-matched 5 carers automatically.
          </p>
          <Input
            label="Preferred carer ID (optional)"
            value={values.preferred_carer_id}
            onChange={(e) => set("preferred_carer_id", e.target.value)}
            placeholder="Paste carer ID from your saved carers"
            hint="Find carer IDs from /m/org/carers"
          />
          <div className="flex items-center gap-3">
            <input
              id="broadcast"
              type="checkbox"
              checked={values.broadcast}
              onChange={(e) => set("broadcast", e.target.checked)}
              className="w-5 h-5 rounded accent-primary"
            />
            <label htmlFor="broadcast" className="text-[14px] text-heading">
              Broadcast to all eligible carers (instead of top 5)
            </label>
          </div>
        </div>
      )}

      {/* ── Step 5: Review ───────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-4">
          <p className="text-[14px] font-semibold text-heading">
            Review your booking
          </p>

          <Card className="p-4 space-y-2">
            <Row label="Service user" value={selectedSU?.full_name ?? "—"} />
            <Row label="Shift type" value={SHIFT_MODE_LABEL[values.shift_mode]} />
            {values.shift_mode !== "recurring_4w" ? (
              <>
                <Row
                  label="Start"
                  value={values.starts_at
                    ? new Date(values.starts_at).toLocaleString("en-GB")
                    : "—"}
                />
                <Row
                  label="End"
                  value={values.ends_at
                    ? new Date(values.ends_at).toLocaleString("en-GB")
                    : "—"}
                />
                {values.shift_mode === "sleep_in" && (
                  <>
                    <Row
                      label="Active hours"
                      value={`${values.active_hours_start} – ${values.active_hours_end}`}
                    />
                    <Row
                      label="Org sleep-in charge"
                      value={`£${values.sleep_in_org_charge.toFixed(2)}`}
                    />
                  </>
                )}
              </>
            ) : (
              <Row
                label="Starts"
                value={values.recurrence_start_date ?? "—"}
              />
            )}
            <Row label="Rate" value={`£${(hourlyRate / 100).toFixed(2)}/hr`} />
            <Row
              label="Estimated total"
              value={`£${(orgChargePreview() / 100).toFixed(2)}`}
              highlight
            />
            {values.shift_mode === "sleep_in" && (
              <p className="text-[11px] text-subheading pt-1">
                Includes active care hours at your carer&rsquo;s rate, plus the
                £{values.sleep_in_org_charge.toFixed(2)} sleep-in allowance
                (overnight portion). Invoiced by{" "}
                <strong>All Care 4 U Group Ltd (operating SpecialCarer)</strong>{" "}
                on net-14 terms.
              </p>
            )}
          </Card>

          <div>
            <label className="block text-[14px] font-semibold text-heading mb-2">
              Booking contact name *
            </label>
            <Input
              value={values.booker_name}
              onChange={(e) => set("booker_name", e.target.value)}
              placeholder="Name of the staff member making this booking"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-heading mb-2">
              Job title / role
            </label>
            <Input
              value={values.booker_role}
              onChange={(e) => set("booker_role", e.target.value)}
              placeholder="e.g. Care coordinator"
            />
          </div>

          <div className="rounded-card bg-slate-50 border border-line p-3 text-[12px] text-subheading">
            By confirming, you agree to the booking terms set out in the Master
            Services Agreement with{" "}
            <strong>All Care 4 U Group Ltd (trading as SpecialCarer)</strong>.
            The cancellation policy applies once a carer has accepted the shift.
          </div>
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={submitting}
          >
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            block
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
          >
            Continue
          </Button>
        ) : (
          <Button
            block
            disabled={!canProceed() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Confirming…" : "Confirm booking"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[13px] text-subheading">{label}</span>
      <span
        className={`text-[13px] font-semibold text-right ${highlight ? "text-primary text-[15px]" : "text-heading"}`}
      >
        {value}
      </span>
    </div>
  );
}
