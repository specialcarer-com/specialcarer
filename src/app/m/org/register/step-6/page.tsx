"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RegShell from "../_components/RegShell";
import { Button, Input } from "../../../_components/ui";

type Form = {
  billing_contact_name: string;
  billing_contact_email: string;
  same_as_office: boolean;
  addr_line1: string;
  addr_line2: string;
  addr_city: string;
  addr_postcode: string;
  po_required: boolean;
  po_mode: "" | "per_booking" | "per_period";
  default_terms: "net_7" | "net_14" | "net_30";
};

const EMPTY: Form = {
  billing_contact_name: "",
  billing_contact_email: "",
  same_as_office: true,
  addr_line1: "",
  addr_line2: "",
  addr_city: "",
  addr_postcode: "",
  po_required: false,
  po_mode: "",
  default_terms: "net_14",
};

export default function Step6() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/org/me", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          billing?: {
            billing_contact_name: string | null;
            billing_contact_email: string | null;
            billing_address: Record<string, unknown> | null;
            po_required: boolean;
            po_mode: string | null;
            default_terms: "net_7" | "net_14" | "net_30";
          } | null;
          org?: { office_address: Record<string, unknown> | null } | null;
        };
        if (cancelled) return;
        const b = json.billing;
        const officeAddr = (json.org?.office_address ?? {}) as Record<string, string>;
        const billAddr = (b?.billing_address ?? {}) as Record<string, string>;
        const same = !b?.billing_address;
        const addr = same ? officeAddr : billAddr;
        setForm({
          billing_contact_name: b?.billing_contact_name ?? "",
          billing_contact_email: b?.billing_contact_email ?? "",
          same_as_office: same,
          addr_line1: addr.line1 ?? "",
          addr_line2: addr.line2 ?? "",
          addr_city: addr.city ?? "",
          addr_postcode: addr.postcode ?? "",
          po_required: !!b?.po_required,
          po_mode:
            b?.po_mode === "per_booking" || b?.po_mode === "per_period"
              ? b.po_mode
              : "",
          default_terms: (b?.default_terms ?? "net_14") as Form["default_terms"],
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const valid =
    form.billing_contact_name.length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.billing_contact_email) &&
    (!form.po_required || form.po_mode !== "");

  async function next() {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/m/org/register/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "step6",
          billing_contact_name: form.billing_contact_name,
          billing_contact_email: form.billing_contact_email,
          billing_address: form.same_as_office
            ? null
            : {
                line1: form.addr_line1,
                line2: form.addr_line2,
                city: form.addr_city,
                postcode: form.addr_postcode,
              },
          po_required: form.po_required,
          po_mode: form.po_required ? form.po_mode : null,
          default_terms: form.default_terms,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't save.");
        return;
      }
      router.push("/m/org/register/step-7");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RegShell
      step={6}
      title="Billing setup"
      subtitle="Where invoices go. No payment info needed yet — Stripe details come later."
      back="/m/org/register/step-5"
    >
      <div className="space-y-3">
        <Input
          label="Billing contact name *"
          value={form.billing_contact_name}
          onChange={(e) => update("billing_contact_name", e.target.value)}
        />
        <Input
          label="Billing contact email *"
          type="email"
          value={form.billing_contact_email}
          onChange={(e) =>
            update("billing_contact_email", e.target.value.trim().toLowerCase())
          }
        />
        <label className="flex items-center gap-2 text-[13px] text-heading">
          <input
            type="checkbox"
            checked={form.same_as_office}
            onChange={(e) => update("same_as_office", e.target.checked)}
          />
          Billing address matches office address
        </label>
        {!form.same_as_office && (
          <div className="space-y-3">
            <Input
              label="Address line 1"
              value={form.addr_line1}
              onChange={(e) => update("addr_line1", e.target.value)}
            />
            <Input
              label="Address line 2"
              value={form.addr_line2}
              onChange={(e) => update("addr_line2", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="City"
                value={form.addr_city}
                onChange={(e) => update("addr_city", e.target.value)}
              />
              <Input
                label="Postcode / ZIP"
                value={form.addr_postcode}
                onChange={(e) => update("addr_postcode", e.target.value)}
              />
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-[13px] text-heading">
          <input
            type="checkbox"
            checked={form.po_required}
            onChange={(e) => update("po_required", e.target.checked)}
          />
          We require a Purchase Order
        </label>
        {form.po_required && (
          <div className="flex flex-wrap gap-2">
            {(["per_booking", "per_period"] as const).map((m) => {
              const on = form.po_mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => update("po_mode", m)}
                  className={`px-3 py-1.5 rounded-pill border text-[13px] font-semibold ${
                    on
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-white border-line text-heading"
                  }`}
                >
                  {m === "per_booking" ? "Per booking" : "Per period"}
                </button>
              );
            })}
          </div>
        )}
        <div>
          <p className="text-[13px] font-semibold text-heading mb-1">
            Preferred terms
          </p>
          <div className="flex flex-wrap gap-2">
            {(["net_7", "net_14", "net_30"] as const).map((t) => {
              const on = form.default_terms === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => update("default_terms", t)}
                  className={`px-3 py-1.5 rounded-pill border text-[13px] font-semibold ${
                    on
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-white border-line text-heading"
                  }`}
                >
                  {t.replace("_", " ")}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-subheading">
          Card-on-file for emergency bookings is optional and added in your
          dashboard later — Phase B.
        </p>
      </div>
      {err && <p className="mt-3 text-[12px] text-rose-700">{err}</p>}
      <div className="mt-5">
        <Button block disabled={!valid || busy} onClick={next}>
          Continue
        </Button>
      </div>
    </RegShell>
  );
}
