"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RegShell from "../_components/RegShell";
import { Button } from "../../../_components/ui";
import {
  ORG_TYPES_GB,
  ORG_TYPES_US,
  type OrgCountry,
} from "@/lib/org/types";

export default function Step2() {
  const router = useRouter();
  const [country, setCountry] = useState<OrgCountry>("GB");
  const [orgType, setOrgType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const types = country === "GB" ? ORG_TYPES_GB : ORG_TYPES_US;

  async function next() {
    if (!orgType) return;
    setBusy(true);
    setErr(null);
    try {
      const purpose =
        typeof window !== "undefined"
          ? sessionStorage.getItem("org_register_purpose")
          : null;
      const res = await fetch("/api/m/org/register/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "step2",
          country,
          org_type: orgType,
          purpose,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        organization_id?: string;
        error?: string;
      };
      if (!res.ok || !json.organization_id) {
        setErr(json.error ?? "Couldn't save.");
        return;
      }
      router.push("/m/org/register/step-3");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RegShell
      step={2}
      title="Country and organisation type"
      subtitle="We use this to ask for the right registration body next."
      back="/m/org/register/step-1"
    >
      <div className="rounded-pill bg-muted p-1 grid grid-cols-2 gap-1">
        {(["GB", "US"] as const).map((c) => {
          const on = country === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCountry(c);
                setOrgType(null);
              }}
              className={`h-9 rounded-pill text-[13px] font-semibold transition ${
                on ? "bg-white text-heading shadow-sm" : "text-subheading"
              }`}
            >
              {c === "GB" ? "United Kingdom" : "United States"}
            </button>
          );
        })}
      </div>
      <ul className="mt-4 space-y-2">
        {types.map((t) => {
          const on = orgType === t.key;
          return (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => setOrgType(t.key)}
                className={`w-full text-left rounded-card border-2 p-3 transition ${
                  on
                    ? "border-primary bg-primary-50"
                    : "border-line bg-white"
                }`}
              >
                <span className="text-[14px] font-semibold text-heading">
                  {t.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {err && <p className="mt-3 text-[12px] text-rose-700">{err}</p>}
      <div className="mt-5">
        <Button block disabled={!orgType || busy} onClick={next}>
          Continue
        </Button>
      </div>
    </RegShell>
  );
}
