"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, TextArea } from "../../_components/ui";
import {
  MOBILITY_LEVELS,
  PROPERTY_SIZES,
  type Country,
  type HouseholdRecipient,
  type Medication,
  type MobilityLevel,
  type PropertySize,
  type RecipientCreateInput,
  type RecipientKind,
} from "@/lib/recipients/types";

interface Props {
  mode: "create" | "edit";
  kind: RecipientKind;
  initial?: HouseholdRecipient;
}

function splitTags(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function joinTags(arr: string[] | null | undefined): string {
  return (arr ?? []).join(", ");
}

export default function RecipientEditor({ mode, kind, initial }: Props) {
  const router = useRouter();

  // Common
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Child
  const [dob, setDob] = useState<string>(initial?.date_of_birth ?? "");
  const [allergies, setAllergies] = useState(joinTags(initial?.allergies));
  const [school, setSchool] = useState(initial?.school ?? "");
  const [specialNeeds, setSpecialNeeds] = useState(
    joinTags(initial?.special_needs),
  );

  // Senior
  const [mobility, setMobility] = useState<MobilityLevel | "">(
    initial?.mobility_level ?? "",
  );
  const [conditions, setConditions] = useState(
    joinTags(initial?.medical_conditions),
  );
  const [medications, setMedications] = useState<Medication[]>(
    initial?.medications ?? [],
  );

  // Home
  const [addr1, setAddr1] = useState(initial?.address_line1 ?? "");
  const [addr2, setAddr2] = useState(initial?.address_line2 ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [postcode, setPostcode] = useState(initial?.postcode ?? "");
  const [country, setCountry] = useState<Country>(
    (initial?.country as Country) ?? "GB",
  );
  const [propertySize, setPropertySize] = useState<PropertySize | "">(
    (initial?.property_size as PropertySize) ?? "",
  );
  const [hasPets, setHasPets] = useState<boolean>(initial?.has_pets ?? false);
  const [petsNotes, setPetsNotes] = useState(initial?.pets_notes ?? "");
  const [accessInstructions, setAccessInstructions] = useState(
    initial?.access_instructions ?? "",
  );

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function buildPayload(): RecipientCreateInput {
    const base: RecipientCreateInput = {
      kind,
      display_name: displayName.trim(),
      notes: notes.trim() || null,
    };
    if (kind === "child") {
      base.date_of_birth = dob || null;
      base.allergies = splitTags(allergies);
      base.school = school.trim() || null;
      base.special_needs = splitTags(specialNeeds);
    }
    if (kind === "senior") {
      base.mobility_level = (mobility || null) as MobilityLevel | null;
      base.medical_conditions = splitTags(conditions);
      base.medications = medications.filter((m) => m.name.trim());
    }
    if (kind === "home") {
      base.address_line1 = addr1.trim() || null;
      base.address_line2 = addr2.trim() || null;
      base.city = city.trim() || null;
      base.region = region.trim() || null;
      base.postcode = postcode.trim() || null;
      base.country = country;
      base.property_size = (propertySize || null) as PropertySize | null;
      base.has_pets = hasPets;
      base.pets_notes = hasPets ? petsNotes.trim() || null : null;
      base.access_instructions = accessInstructions.trim() || null;
    }
    return base;
  }

  async function handleSave() {
    setErr(null);
    if (!displayName.trim()) {
      setErr("Please give them a name.");
      return;
    }
    setSaving(true);
    try {
      const url =
        mode === "create"
          ? "/api/me/recipients"
          : `/api/me/recipients/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      router.push("/m/household");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm(`Remove ${initial.display_name} from your household?`)) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/me/recipients/${initial.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Could not delete");
      }
      router.push("/m/household");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-5 space-y-5 pb-32">
      <Section title="Basics">
        <Field
          label={
            kind === "home" ? "Nickname (e.g. Our flat)" : "Their name"
          }
        >
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            placeholder={
              kind === "child"
                ? "Lily"
                : kind === "senior"
                  ? "Mum"
                  : "Our flat"
            }
          />
        </Field>
        <Field label="Notes (optional)">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Anything caregivers should know"
          />
        </Field>
      </Section>

      {kind === "child" && (
        <Section title="About this child">
          <Field label="Date of birth">
            <Input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </Field>
          <Field label="School / nursery (optional)">
            <Input
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Allergies (comma-separated)">
            <Input
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="peanuts, dairy"
            />
          </Field>
          <Field label="Special needs / SEN (comma-separated)">
            <Input
              value={specialNeeds}
              onChange={(e) => setSpecialNeeds(e.target.value)}
              placeholder="autism, ADHD"
            />
          </Field>
        </Section>
      )}

      {kind === "senior" && (
        <Section title="About this person">
          <Field label="Mobility">
            <select
              value={mobility}
              onChange={(e) =>
                setMobility(e.target.value as MobilityLevel | "")
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-heading focus:border-brand focus:outline-none"
            >
              <option value="">— Select —</option>
              {MOBILITY_LEVELS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Medical conditions (comma-separated)">
            <Input
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="dementia, diabetes"
            />
          </Field>

          <div>
            <div className="text-sm font-medium text-heading mb-1">
              Medications
            </div>
            <div className="space-y-2">
              {medications.map((m, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 bg-white border border-slate-100 rounded-xl p-2"
                >
                  <input
                    className="col-span-4 px-2 py-2 text-sm rounded-lg border border-slate-200"
                    placeholder="Name"
                    value={m.name}
                    onChange={(e) => {
                      const next = [...medications];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setMedications(next);
                    }}
                  />
                  <input
                    className="col-span-3 px-2 py-2 text-sm rounded-lg border border-slate-200"
                    placeholder="Dose"
                    value={m.dose ?? ""}
                    onChange={(e) => {
                      const next = [...medications];
                      next[idx] = { ...next[idx], dose: e.target.value };
                      setMedications(next);
                    }}
                  />
                  <input
                    className="col-span-4 px-2 py-2 text-sm rounded-lg border border-slate-200"
                    placeholder="When"
                    value={m.schedule ?? ""}
                    onChange={(e) => {
                      const next = [...medications];
                      next[idx] = { ...next[idx], schedule: e.target.value };
                      setMedications(next);
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Remove medication"
                    className="col-span-1 text-rose-600 text-lg"
                    onClick={() =>
                      setMedications(medications.filter((_, i) => i !== idx))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setMedications([
                  ...medications,
                  { name: "", dose: "", schedule: "" },
                ])
              }
              className="mt-2 text-sm font-medium text-brand-700"
            >
              + Add medication
            </button>
          </div>
        </Section>
      )}

      {kind === "home" && (
        <Section title="Address">
          <Field label="Address line 1">
            <Input
              value={addr1}
              onChange={(e) => setAddr1(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Address line 2 (optional)">
            <Input
              value={addr2}
              onChange={(e) => setAddr2(e.target.value)}
              maxLength={120}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="Region">
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="Postcode / ZIP">
              <Input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                maxLength={20}
              />
            </Field>
            <Field label="Country">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value as Country)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-heading focus:border-brand focus:outline-none"
              >
                <option value="GB">United Kingdom</option>
                <option value="US">United States</option>
              </select>
            </Field>
          </div>
        </Section>
      )}

      {kind === "home" && (
        <Section title="The home">
          <Field label="Property size">
            <select
              value={propertySize}
              onChange={(e) =>
                setPropertySize(e.target.value as PropertySize | "")
              }
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-heading focus:border-brand focus:outline-none"
            >
              <option value="">— Select —</option>
              {PROPERTY_SIZES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-heading">
            <input
              type="checkbox"
              checked={hasPets}
              onChange={(e) => setHasPets(e.target.checked)}
              className="w-4 h-4"
            />
            Has pets
          </label>
          {hasPets && (
            <Field label="About the pets">
              <Input
                value={petsNotes}
                onChange={(e) => setPetsNotes(e.target.value)}
                placeholder="2 cats, friendly dog"
                maxLength={200}
              />
            </Field>
          )}
          <Field label="Access instructions (optional)">
            <TextArea
              value={accessInstructions}
              onChange={(e) => setAccessInstructions(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Gate code, parking, where to leave shoes"
            />
          </Field>
        </Section>
      )}

      {err && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {err}
        </p>
      )}

      <div className="fixed left-0 right-0 bottom-16 bg-bg-screen/95 backdrop-blur border-t border-slate-100 px-4 py-3 z-20">
        <div className="flex gap-3 max-w-md mx-auto">
          {mode === "edit" && (
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={saving}
              className="text-rose-600"
            >
              Remove
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} block>
            {saving ? "Saving…" : mode === "create" ? "Add to household" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
      <div className="font-semibold text-heading">{title}</div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-heading mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
