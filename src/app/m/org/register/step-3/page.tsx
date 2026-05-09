"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RegShell from "../_components/RegShell";
import { Button, Input, TextArea } from "../../../_components/ui";
import { SIZE_BANDS } from "@/lib/org/types";

type Form = {
  legal_name: string;
  trading_name: string;
  companies_house_number: string;
  ein: string;
  vat_number: string;
  year_established: string;
  size_band: string;
  website: string;
  addr_line1: string;
  addr_line2: string;
  addr_city: string;
  addr_postcode: string;
};

const EMPTY: Form = {
  legal_name: "",
  trading_name: "",
  companies_house_number: "",
  ein: "",
  vat_number: "",
  year_established: "",
  size_band: "",
  website: "",
  addr_line1: "",
  addr_line2: "",
  addr_city: "",
  addr_postcode: "",
};

export default function Step3() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [country, setCountry] = useState<"GB" | "US">("GB");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/org/me", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          org?: {
            country: "GB" | "US" | null;
            legal_name: string | null;
            trading_name: string | null;
            companies_house_number: string | null;
            ein: string | null;
            vat_number: string | null;
            year_established: number | null;
            size_band: string | null;
            office_address: Record<string, unknown> | null;
            website: string | null;
          } | null;
        };
        if (cancelled || !json.org) return;
        setCountry(json.org.country === "US" ? "US" : "GB");
        const addr = (json.org.office_address ?? {}) as Record<string, string>;
        setForm({
          legal_name: json.org.legal_name ?? "",
          trading_name: json.org.trading_name ?? "",
          companies_house_number: json.org.companies_house_number ?? "",
          ein: json.org.ein ?? "",
          vat_number: json.org.vat_number ?? "",
          year_established:
            json.org.year_established != null
              ? String(json.org.year_established)
              : "",
          size_band: json.org.size_band ?? "",
          website: json.org.website ?? "",
          addr_line1: addr.line1 ?? "",
          addr_line2: addr.line2 ?? "",
          addr_city: addr.city ?? "",
          addr_postcode: addr.postcode ?? "",
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
    form.legal_name.length >= 2 &&
    form.size_band !== "" &&
    form.addr_line1.length >= 2 &&
    form.addr_city.length >= 2 &&
    (country === "US" ? form.ein.length >= 2 : form.companies_house_number.length >= 2);

  async function next() {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/m/org/register/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "step3",
          legal_name: form.legal_name,
          trading_name: form.trading_name,
          companies_house_number: form.companies_house_number,
          ein: form.ein,
          vat_number: form.vat_number,
          year_established: form.year_established
            ? Number(form.year_established)
            : undefined,
          size_band: form.size_band,
          website: form.website,
          office_address: {
            line1: form.addr_line1,
            line2: form.addr_line2,
            city: form.addr_city,
            postcode: form.addr_postcode,
            country,
          },
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't save.");
        return;
      }
      router.push("/m/org/register/step-4");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RegShell
      step={3}
      title="Organisation identity"
      subtitle="Legal details that should match your registration record."
      back="/m/org/register/step-2"
    >
      <div className="space-y-3">
        <Input
          label="Legal name *"
          value={form.legal_name}
          onChange={(e) => update("legal_name", e.target.value)}
          maxLength={160}
        />
        <Input
          label="Trading name (if different)"
          value={form.trading_name}
          onChange={(e) => update("trading_name", e.target.value)}
          maxLength={160}
        />
        {country === "GB" ? (
          <Input
            label="Companies House number *"
            value={form.companies_house_number}
            onChange={(e) =>
              update("companies_house_number", e.target.value)
            }
            maxLength={32}
          />
        ) : (
          <Input
            label="EIN *"
            value={form.ein}
            onChange={(e) => update("ein", e.target.value)}
            maxLength={32}
          />
        )}
        <Input
          label="VAT / Sales tax ID (optional)"
          value={form.vat_number}
          onChange={(e) => update("vat_number", e.target.value)}
          maxLength={32}
        />
        <Input
          label="Year established (optional)"
          value={form.year_established}
          type="number"
          onChange={(e) => update("year_established", e.target.value)}
        />
        <div>
          <p className="text-[13px] font-semibold text-heading mb-1">Size *</p>
          <div className="flex flex-wrap gap-2">
            {SIZE_BANDS.map((b) => {
              const on = form.size_band === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => update("size_band", b)}
                  className={`px-3 py-1.5 rounded-pill border text-[13px] font-semibold ${
                    on
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-white border-line text-heading"
                  }`}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[13px] font-semibold text-heading">Office address *</p>
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
            label={country === "US" ? "ZIP" : "Postcode"}
            value={form.addr_postcode}
            onChange={(e) => update("addr_postcode", e.target.value)}
          />
        </div>
        <Input
          label="Website (optional)"
          value={form.website}
          type="url"
          onChange={(e) => update("website", e.target.value)}
        />
        <TextArea
          label="Notes (visible only to admins)"
          rows={2}
          value=""
          readOnly
          className="hidden"
        />
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
