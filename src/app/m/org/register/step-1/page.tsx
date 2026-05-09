"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RegShell from "../_components/RegShell";
import { Button } from "../../../_components/ui";
import { ORG_PURPOSES, type OrgPurpose } from "@/lib/org/types";

export default function Step1() {
  const router = useRouter();
  const [purpose, setPurpose] = useState<OrgPurpose | null>(null);
  const [busy, setBusy] = useState(false);

  async function next() {
    if (!purpose) return;
    setBusy(true);
    try {
      await fetch("/api/m/org/register/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "step1", purpose }),
      }).catch(() => undefined);
      // Step 1 doesn't yet have an org row — stash the value in
      // sessionStorage so step 2 can submit both purpose + org_type
      // together when the row gets created.
      if (typeof window !== "undefined") {
        sessionStorage.setItem("org_register_purpose", purpose);
      }
      router.push("/m/org/register/step-2");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RegShell
      step={1}
      title="Why are you here?"
      subtitle="Picks the right onboarding tour later — not a hard gate."
    >
      <ul className="space-y-2">
        {ORG_PURPOSES.map((p) => {
          const on = purpose === p.key;
          return (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => setPurpose(p.key)}
                className={`w-full text-left rounded-card border-2 p-4 transition ${
                  on
                    ? "border-primary bg-primary-50"
                    : "border-line bg-white"
                }`}
              >
                <span className="text-[15px] font-bold text-heading">
                  {p.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-5">
        <Button block disabled={!purpose || busy} onClick={next}>
          Continue
        </Button>
      </div>
    </RegShell>
  );
}
