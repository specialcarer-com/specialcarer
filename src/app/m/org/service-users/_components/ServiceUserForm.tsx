"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Input,
  TextArea,
  Button,
  Tag,
} from "../../../_components/ui";
import {
  CARE_CATEGORIES,
  CARE_CATEGORY_LABEL,
  type ServiceUser,
  type CareCategory,
} from "@/lib/org/booking-types";

type Props =
  | { mode: "create"; serviceUser?: never }
  | { mode: "edit"; serviceUser: ServiceUser };

export default function ServiceUserForm({ mode, serviceUser }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: serviceUser?.full_name ?? "",
    dob: serviceUser?.dob ?? "",
    gender: serviceUser?.gender ?? "",
    address_line1: serviceUser?.address_line1 ?? "",
    address_line2: serviceUser?.address_line2 ?? "",
    city: serviceUser?.city ?? "",
    postcode: serviceUser?.postcode ?? "",
    care_categories: (serviceUser?.care_categories ?? []) as CareCategory[],
    care_needs: serviceUser?.care_needs ?? "",
    safety_notes: serviceUser?.safety_notes ?? "",
    primary_contact_name: serviceUser?.primary_contact_name ?? "",
    primary_contact_phone: serviceUser?.primary_contact_phone ?? "",
  });

  function toggleCategory(cat: CareCategory) {
    setForm((f) => ({
      ...f,
      care_categories: f.care_categories.includes(cat)
        ? f.care_categories.filter((c) => c !== cat)
        : [...f.care_categories, cat],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim()) {
      setError("Full name is required.");
      return;
    }
    setSaving(true);
    try {
      const url =
        mode === "create"
          ? "/api/m/org/service-users"
          : `/api/m/org/service-users/${serviceUser!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Save failed");
      }
      router.push("/m/org/service-users");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm("Archive this service user? This cannot be undone.")) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/m/org/service-users/${serviceUser!.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Archive failed");
      router.push("/m/org/service-users");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-10">
      {error && (
        <div className="rounded-card bg-rose-50 border border-rose-200 p-3">
          <p className="text-[13px] text-rose-800">{error}</p>
        </div>
      )}

      <Input
        label="Full name *"
        value={form.full_name}
        onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
        required
        placeholder="e.g. Margaret Thompson"
      />

      <Input
        label="Date of birth"
        type="date"
        value={form.dob}
        onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
      />

      <div>
        <label className="block text-[14px] font-semibold text-heading mb-2">
          Gender
        </label>
        <select
          className="w-full h-14 rounded-btn border border-line bg-white px-4 text-[15px] text-heading"
          value={form.gender}
          onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
        >
          <option value="">Prefer not to say</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="non_binary">Non-binary</option>
          <option value="other">Other</option>
        </select>
      </div>

      <Input
        label="Address line 1"
        value={form.address_line1}
        onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
        placeholder="House number and street"
      />
      <Input
        label="Address line 2"
        value={form.address_line2}
        onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
        placeholder="Flat, block, etc."
      />
      <div className="flex gap-3">
        <Input
          label="City"
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          className="flex-1"
        />
        <Input
          label="Postcode"
          value={form.postcode}
          onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
          className="w-32"
          placeholder="e.g. SW1A 1AA"
        />
      </div>

      {/* Care categories */}
      <div>
        <label className="block text-[14px] font-semibold text-heading mb-2">
          Care categories
        </label>
        <div className="flex flex-wrap gap-2">
          {CARE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`px-3 py-1.5 rounded-pill text-[13px] font-semibold border transition
                ${
                  form.care_categories.includes(cat)
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
        label="Care needs"
        value={form.care_needs}
        onChange={(e) => setForm((f) => ({ ...f, care_needs: e.target.value }))}
        rows={3}
        placeholder="Describe the person's care requirements, conditions, preferences..."
      />

      <TextArea
        label="Safety notes"
        value={form.safety_notes}
        onChange={(e) => setForm((f) => ({ ...f, safety_notes: e.target.value }))}
        rows={3}
        hint="Shared in anonymised form with the assigned carer before the shift."
        placeholder="Access codes, mobility aids, behavioural triggers, medication notes..."
      />

      <Input
        label="Primary contact name"
        value={form.primary_contact_name}
        onChange={(e) => setForm((f) => ({ ...f, primary_contact_name: e.target.value }))}
        placeholder="Next of kin or key worker"
      />
      <Input
        label="Primary contact phone"
        type="tel"
        value={form.primary_contact_phone}
        onChange={(e) => setForm((f) => ({ ...f, primary_contact_phone: e.target.value }))}
        placeholder="+44 7700 900123"
      />

      <Button type="submit" block disabled={saving}>
        {saving ? "Saving…" : mode === "create" ? "Add service user" : "Save changes"}
      </Button>

      {mode === "edit" && (
        <Button
          type="button"
          variant="danger"
          block
          disabled={saving}
          onClick={handleArchive}
        >
          Archive service user
        </Button>
      )}
    </form>
  );
}
