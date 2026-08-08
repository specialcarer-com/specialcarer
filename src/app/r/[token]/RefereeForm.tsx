"use client";

import React, { useState } from "react";
import {
  REFERENCE_TYPE_LABEL,
  REFERENCE_TYPES,
  TRISTATE_YES_NO,
  type ReferenceType,
  type YesNoUnsure,
} from "@/lib/vetting/types";

type Props = {
  token: string;
  carerName: string;
  refereeName: string;
  refereeEmail: string;
  initialReferenceType: ReferenceType | null;
};

const inputClass =
  "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:border-[#039EA0] focus:outline-none focus:ring-2 focus:ring-[#039EA0]/15";

export default function RefereeForm({
  token,
  carerName,
  refereeName,
  refereeEmail,
  initialReferenceType,
}: Props) {
  const [referenceType, setReferenceType] = useState<ReferenceType>(
    initialReferenceType ?? "employer",
  );
  const [employmentStart, setEmploymentStart] = useState("");
  const [employmentEnd, setEmploymentEnd] = useState("");
  const [stillEmployed, setStillEmployed] = useState(false);
  const [positionHeld, setPositionHeld] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
  const [reasonForLeaving, setReasonForLeaving] = useState("");
  const [absenceDays, setAbsenceDays] = useState("");
  const [sponsorsVisa, setSponsorsVisa] = useState("");
  const [warningsUndisposed, setWarningsUndisposed] =
    useState<YesNoUnsure | "">("");
  const [underInvestigation, setUnderInvestigation] =
    useState<YesNoUnsure | "">("");
  const [safeguardingDbs, setSafeguardingDbs] = useState<YesNoUnsure | "">("");
  const [wouldReemploy, setWouldReemploy] = useState<YesNoUnsure | "">("");
  const [valuesExample, setValuesExample] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [refereePosition, setRefereePosition] = useState("");
  const [refereeCompany, setRefereeCompany] = useState("");
  const [refereeCompanyAddr, setRefereeCompanyAddr] = useState("");
  const [refereeSignedDate, setRefereeSignedDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [state, setState] = useState<
    "idle" | "submitting" | "ok" | "err"
  >("idle");
  const [errors, setErrors] = useState<string[]>([]);

  const hasEmploymentFields = referenceType !== "character";
  const needsEmploymentDetails =
    referenceType === "employer" || referenceType === "professional";

  function validate(): string[] {
    const missing: string[] = [];
    if (
      needsEmploymentDetails &&
      !employmentStart
    ) {
      missing.push("Employment start date");
    }
    if (needsEmploymentDetails && !positionHeld.trim()) {
      missing.push("Position held");
    }
    if (referenceType === "employer" && !stillEmployed && !reasonForLeaving.trim()) {
      missing.push("Reason for leaving");
    }
    if (hasEmploymentFields && weeklyHours === "") missing.push("Weekly hours");
    if (hasEmploymentFields && absenceDays === "") {
      missing.push("Days absent in the last 12 months");
    }
    if (!warningsUndisposed) missing.push("Warnings not disposed");
    if (!underInvestigation) missing.push("Conduct or performance investigation");
    if (!safeguardingDbs) missing.push("Safeguarding allegations or DBS referrals");
    if (!wouldReemploy) missing.push("Would you re-employ this person?");
    if (!valuesExample.trim()) missing.push("Values example");
    if (!refereePosition.trim()) missing.push("Your position");
    if (!refereeCompany.trim()) missing.push("Company name");
    if (!refereeCompanyAddr.trim()) missing.push("Company address");
    if (!refereeSignedDate) missing.push("Today's date");
    if (employmentStart && employmentStart > new Date().toISOString().slice(0, 10)) {
      missing.push("Employment start date cannot be in the future");
    }
    if (employmentStart && employmentEnd && employmentEnd < employmentStart) {
      missing.push("Employment end date cannot be before the start date");
    }
    if (stillEmployed && employmentEnd) {
      missing.push("Remove the employment end date when still employed");
    }
    if (hasEmploymentFields && (Number(weeklyHours) < 0 || Number(weeklyHours) > 168)) {
      missing.push("Weekly hours must be between 0 and 168");
    }
    if (hasEmploymentFields && (!Number.isInteger(Number(absenceDays)) || Number(absenceDays) < 0 || Number(absenceDays) > 366)) {
      missing.push("Days absent must be a whole number between 0 and 366");
    }
    if (recommend === null) missing.push("Whether you would recommend this carer");
    return missing;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing = validate();
    if (missing.length > 0) {
      setErrors(missing);
      setState("err");
      return;
    }
    setState("submitting");
    setErrors([]);
    try {
      const res = await fetch("/api/references/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reference_type: referenceType,
          employment_start: employmentStart || null,
          employment_end: employmentEnd || null,
          still_employed: stillEmployed,
          position_held: positionHeld.trim() || null,
          weekly_hours: hasEmploymentFields ? Number(weeklyHours) : null,
          reason_for_leaving: reasonForLeaving.trim() || null,
          absence_days_12m: hasEmploymentFields ? Number(absenceDays) : null,
          sponsors_visa: sponsorsVisa.trim() || null,
          warnings_undisposed: warningsUndisposed,
          under_investigation: underInvestigation,
          safeguarding_dbs: safeguardingDbs,
          would_reemploy: wouldReemploy,
          values_example: valuesExample.trim(),
          referee_position: refereePosition.trim(),
          referee_company: refereeCompany.trim(),
          referee_company_addr: refereeCompanyAddr.trim(),
          referee_signed_date: refereeSignedDate,
          rating,
          recommend,
          comment: comment.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setState("err");
        setErrors([prettyError(json.error)]);
        return;
      }
      setState("ok");
    } catch {
      setState("err");
      setErrors(["Network error. Please try again."]);
    }
  }

  if (state === "ok") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800">
        Thank you! Your reference has been received.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <FormSection title="Candidate details">
        <Field label="Candidate name">
          <input className={`${inputClass} bg-slate-50`} readOnly value={carerName} />
        </Field>
      </FormSection>

      <FormSection title="About the candidate">
        <Field label="Reference type" required>
          <select
            value={referenceType}
            onChange={(e) => setReferenceType(e.target.value as ReferenceType)}
            className={inputClass}
          >
            {REFERENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {REFERENCE_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </Field>

        {hasEmploymentFields && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field
                label="Employment start date"
                required={needsEmploymentDetails}
              >
                <input
                  type="date"
                  value={employmentStart}
                  onChange={(e) => setEmploymentStart(e.target.value)}
                  required={needsEmploymentDetails}
                  className={inputClass}
                />
              </Field>
              <Field label="Employment end date">
                <input
                  type="date"
                  value={employmentEnd}
                  onChange={(e) => setEmploymentEnd(e.target.value)}
                  disabled={stillEmployed}
                  className={inputClass}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={stillEmployed}
                onChange={(e) => {
                  setStillEmployed(e.target.checked);
                  if (e.target.checked) setEmploymentEnd("");
                }}
                className="h-4 w-4 rounded border-slate-300 text-[#039EA0] focus:ring-[#039EA0]"
              />
              Still currently employed
            </label>
            <Field label="Position held" required={needsEmploymentDetails}>
              <input
                type="text"
                value={positionHeld}
                onChange={(e) => setPositionHeld(e.target.value)}
                maxLength={120}
                required={needsEmploymentDetails}
                className={inputClass}
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Weekly hours" required>
                <input
                  type="number"
                  min="0"
                  max="168"
                  step="0.1"
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(e.target.value)}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Days absent in the last 12 months" required>
                <input
                  type="number"
                  min="0"
                  max="366"
                  step="1"
                  value={absenceDays}
                  onChange={(e) => setAbsenceDays(e.target.value)}
                  required
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">
                  If the candidate worked for you for less than 12 months, give
                  the total number of days absent during their employment.
                </p>
              </Field>
            </div>
            <Field
              label="Reason for leaving"
              required={referenceType === "employer" && !stillEmployed}
            >
              <input
                type="text"
                value={reasonForLeaving}
                onChange={(e) => setReasonForLeaving(e.target.value)}
                maxLength={500}
                required={referenceType === "employer" && !stillEmployed}
                className={inputClass}
              />
            </Field>
          </>
        )}

        <Field label="Do you sponsor this candidate's visa?">
          <input
            type="text"
            value={sponsorsVisa}
            onChange={(e) => setSponsorsVisa(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </Field>
        <TriStateField
          label="Are there any warnings on the candidate's record that have not been disposed?"
          value={warningsUndisposed}
          onChange={setWarningsUndisposed}
        />
        <TriStateField
          label="Is the candidate under investigation for conduct or performance?"
          value={underInvestigation}
          onChange={setUnderInvestigation}
        />
        <TriStateField
          label="Are you aware of any safeguarding allegations or DBS referrals?"
          helper="Including any referrals to the DBS or LADO"
          value={safeguardingDbs}
          onChange={setSafeguardingDbs}
        />
        <TriStateField
          label="Would you re-employ this person?"
          value={wouldReemploy}
          onChange={setWouldReemploy}
        />
        <Field
          label="Please describe a time the candidate demonstrated genuine kindness, professionalism or safeguarding awareness"
          required
        >
          <textarea
            value={valuesExample}
            onChange={(e) => setValuesExample(e.target.value)}
            maxLength={2000}
            rows={5}
            required
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">
            {valuesExample.length}/2000 characters
          </p>
        </Field>
      </FormSection>

      <FormSection title="Rating">
        <Field label="Overall rating">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                aria-pressed={n === rating}
                className="text-3xl leading-none focus:outline-none"
              >
                <span className={n <= rating ? "text-[#F4A261]" : "text-slate-300"}>
                  ★
                </span>
              </button>
            ))}
            <span className="ml-3 text-sm text-slate-600">{rating}/5</span>
          </div>
        </Field>
        <Field label="Would you recommend this carer to others?" required>
          <div className="flex gap-2">
            {[
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setRecommend(option.value)}
                aria-pressed={recommend === option.value}
                className={`px-4 py-2 rounded-full border text-sm font-semibold transition ${
                  recommend === option.value
                    ? "bg-[#0F1416] border-[#0F1416] text-white"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Anything else you'd like us to know?">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="How long did you know them? In what capacity? Strengths?"
            className={inputClass}
          />
        </Field>
      </FormSection>

      <FormSection title="About you">
        <Field label="Your name">
          <input className={`${inputClass} bg-slate-50`} readOnly value={refereeName} />
        </Field>
        <Field label="Your position" required>
          <input
            type="text"
            value={refereePosition}
            onChange={(e) => setRefereePosition(e.target.value)}
            maxLength={120}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Your email">
          <input className={`${inputClass} bg-slate-50`} readOnly value={refereeEmail} />
        </Field>
        <Field label="Company name" required>
          <input
            type="text"
            value={refereeCompany}
            onChange={(e) => setRefereeCompany(e.target.value)}
            maxLength={160}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Company address" required>
          <textarea
            value={refereeCompanyAddr}
            onChange={(e) => setRefereeCompanyAddr(e.target.value)}
            maxLength={500}
            rows={3}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Today's date" required>
          <input
            type="date"
            value={refereeSignedDate}
            onChange={(e) => setRefereeSignedDate(e.target.value)}
            required
            className={inputClass}
          />
        </Field>
      </FormSection>

      <div className="rounded-xl border border-[#039EA0]/20 bg-[#F4EFE6] p-4 text-xs leading-relaxed text-slate-700">
        <strong>Data Protection.</strong> This form contains personal data as
        defined by the Data Protection Act 2018 (underpinned by the UK GDPR).
        SpecialCarer requests this data solely for the purpose of vetting care
        workers and complying with CQC Schedule 3. We will protect this
        information and only share it with authorised staff and — where
        required — the CQC or Local Authority Designated Officer. For details
        see <a href="/privacy" className="font-semibold text-[#039EA0] underline">Privacy Policy</a>.
      </div>

      {state === "err" && errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Please check the following fields:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}
      <button
        type="submit"
        disabled={state === "submitting"}
        className="w-full px-5 py-3 rounded-xl bg-[#039EA0] text-white text-sm font-semibold hover:bg-[#027f81] transition disabled:opacity-60"
      >
        {state === "submitting" ? "Submitting…" : "Submit reference"}
      </button>
    </form>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-slate-200 pb-2 text-lg font-bold text-[#0F1416]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      <span className="mb-1 block">
        {required && <span className="mr-1 text-rose-700">*</span>}
        {label}
      </span>
      {children}
    </label>
  );
}

function TriStateField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  value: YesNoUnsure | "";
  onChange: (value: YesNoUnsure) => void;
}) {
  return (
    <Field label={label} required>
      {helper && <p className="mb-2 text-xs font-normal text-slate-500">{helper}</p>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as YesNoUnsure)}
        required
        className={inputClass}
      >
        <option value="" disabled>Please select</option>
        {TRISTATE_YES_NO.map((option) => (
          <option key={option} value={option}>
            {option.charAt(0).toUpperCase() + option.slice(1)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function prettyError(code: string | undefined): string {
  switch (code) {
    case "expired":
      return "This link has expired.";
    case "already_submitted":
      return "This reference has already been submitted.";
    case "not_found":
      return "Reference link not found.";
    default:
      return code?.replace(/_/g, " ") ?? "Something went wrong. Please try again.";
  }
}
