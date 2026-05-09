"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RegShell from "../_components/RegShell";
import { Button, Input, TextArea } from "../../../_components/ui";

type Form = {
  cqc_number: string;
  ofsted_urn: string;
  charity_number: string;
  la_gss_code: string;
  us_npi: string;
  other_registration_note: string;
};

const EMPTY: Form = {
  cqc_number: "",
  ofsted_urn: "",
  charity_number: "",
  la_gss_code: "",
  us_npi: "",
  other_registration_note: "",
};

const FIELDS_FOR_GB: Record<string, (keyof Form)[]> = {
  nhs_trust: ["cqc_number"],
  local_authority: ["la_gss_code"],
  social_services: ["la_gss_code"],
  discharge_team: ["cqc_number"],
  hospice: ["cqc_number"],
  residential_care_home: ["cqc_number"],
  care_home_group: ["cqc_number"],
  domiciliary_care: ["cqc_number"],
  fostering_agency: ["ofsted_urn"],
  childrens_residential: ["ofsted_urn"],
  sen_school: ["ofsted_urn"],
  private_hospital: ["cqc_number"],
  charity: ["charity_number"],
  other: [],
};
const FIELDS_FOR_US: Record<string, (keyof Form)[]> = {
  hospital: ["us_npi"],
  hospice: ["us_npi"],
  snf: ["us_npi"],
  alf: ["us_npi"],
  home_health: ["us_npi"],
  foster_care: [],
  school_district: [],
  charity_501c3: ["charity_number"],
  government: ["la_gss_code"],
  other: [],
};

const LABELS: Record<keyof Form, string> = {
  cqc_number: "CQC registration number",
  ofsted_urn: "Ofsted URN",
  charity_number: "Charity Commission / OSCR number",
  la_gss_code: "Local authority code (ONS GSS)",
  us_npi: "HHS NPI / CMS Provider ID",
  other_registration_note: "Other registration / notes",
};

export default function Step4() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [country, setCountry] = useState<"GB" | "US">("GB");
  const [orgType, setOrgType] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/org/me", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { org?: Record<string, unknown> | null };
        if (cancelled || !json.org) return;
        const o = json.org;
        setCountry(o.country === "US" ? "US" : "GB");
        setOrgType(typeof o.org_type === "string" ? o.org_type : "");
        setForm({
          cqc_number: (o.cqc_number as string) ?? "",
          ofsted_urn: (o.ofsted_urn as string) ?? "",
          charity_number: (o.charity_number as string) ?? "",
          la_gss_code: (o.la_gss_code as string) ?? "",
          us_npi: (o.us_npi as string) ?? "",
          other_registration_note:
            (o.other_registration_note as string) ?? "",
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const askedFields = (
    country === "GB" ? FIELDS_FOR_GB : FIELDS_FOR_US
  )[orgType] ?? [];

  function update<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function next() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/m/org/register/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "step4", ...form }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't save.");
        return;
      }
      router.push("/m/org/register/step-5");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RegShell
      step={4}
      title="Sector registration"
      subtitle="Tells us where you fit in the regulator's records."
      back="/m/org/register/step-3"
    >
      {askedFields.length === 0 ? (
        <p className="text-[13px] text-subheading">
          No specific regulator fields for this org type. Add anything we
          should know in the note below.
        </p>
      ) : (
        <div className="space-y-3">
          {askedFields.map((f) => (
            <Input
              key={f}
              label={LABELS[f]}
              value={form[f]}
              onChange={(e) => update(f, e.target.value)}
              maxLength={120}
            />
          ))}
        </div>
      )}
      <div className="mt-3">
        <TextArea
          label="Anything else? (optional)"
          rows={3}
          value={form.other_registration_note}
          onChange={(e) =>
            update("other_registration_note", e.target.value.slice(0, 1000))
          }
        />
      </div>
      {err && <p className="mt-3 text-[12px] text-rose-700">{err}</p>}
      <div className="mt-5">
        <Button block disabled={busy} onClick={next}>
          Continue
        </Button>
      </div>
    </RegShell>
  );
}
