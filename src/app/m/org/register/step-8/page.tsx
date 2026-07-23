"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RegShell from "../_components/RegShell";
import { Button, Card } from "../../../_components/ui";
import {
  DOC_KIND_LABEL,
  type DocKind,
  type OfficeAddress,
} from "@/lib/org/types";

type MeResp = {
  org: {
    id: string;
    legal_name: string | null;
    trading_name: string | null;
    country: "GB" | "US" | null;
    org_type: string | null;
    purpose: string | null;
    size_band: string | null;
    office_address: OfficeAddress | null;
    companies_house_number: string | null;
    ein: string | null;
    cqc_number: string | null;
    ofsted_urn: string | null;
    charity_number: string | null;
    la_gss_code: string | null;
    us_npi: string | null;
    other_registration_note: string | null;
    free_email_override: boolean;
    verification_status: string;
  } | null;
  me: {
    full_name: string | null;
    work_email: string | null;
    phone: string | null;
    job_title: string | null;
    is_signatory: boolean;
  } | null;
  documents: Array<{ kind: DocKind; filename: string | null }>;
  billing: {
    billing_contact_name: string | null;
    billing_contact_email: string | null;
    po_required: boolean;
    po_mode: string | null;
    default_terms: string;
  } | null;
};

type Contract = {
  id: string;
  contract_type: "msa" | "dpa";
  version: string;
  status: string;
  signed_at: string | null;
};

export default function Step8() {
  const router = useRouter();
  const [data, setData] = useState<MeResp | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, ctRes] = await Promise.all([
          fetch("/api/m/org/me", { cache: "no-store" }),
          fetch("/api/m/org/contracts", { cache: "no-store" }),
        ]);
        if (meRes.ok) {
          const json = (await meRes.json()) as MeResp;
          if (!cancelled) setData(json);
        }
        if (ctRes.ok) {
          const json = (await ctRes.json()) as { contracts?: Contract[] };
          if (!cancelled) setContracts(json.contracts ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/m/org/register/submit", { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't submit.");
        return;
      }
      router.push("/m/org/register/step-9");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <RegShell step={9} title="Review & submit">
        <p className="text-[13px] text-subheading">Loading…</p>
      </RegShell>
    );
  }
  const o = data.org;
  if (!o) {
    return (
      <RegShell step={9} title="Review & submit">
        <p className="text-[13px] text-subheading">
          Nothing to review yet — start at step 1.
        </p>
        <Link href="/m/org/register/step-1" className="text-primary font-semibold mt-3 block">
          Back to step 1
        </Link>
      </RegShell>
    );
  }

  return (
    <RegShell
      step={9}
      title="Review & submit"
      subtitle="Pending review takes around 2 business days. You can browse carers right after submitting."
      back="/m/org/register/step-7-5"
    >
      <Card className="p-4 space-y-2">
        <Section title="Organisation" href="/m/org/register/step-3">
          <p className="text-[14px] font-semibold text-heading">
            {o.legal_name ?? "—"}
          </p>
          <p className="text-[12px] text-subheading">
            {o.trading_name && `Trading as ${o.trading_name} · `}
            {o.country} · {o.org_type ?? "—"} · {o.size_band ?? "size n/a"}
          </p>
          <p className="text-[12px] text-subheading">
            {(o.office_address?.line1 ?? "") +
              (o.office_address?.city ? `, ${o.office_address.city}` : "") +
              (o.office_address?.postcode
                ? `, ${o.office_address.postcode}`
                : "")}
          </p>
        </Section>
        <Section title="Sector ID" href="/m/org/register/step-4">
          <p className="text-[12px] text-subheading">
            {[
              o.companies_house_number && `CH: ${o.companies_house_number}`,
              o.ein && `EIN: ${o.ein}`,
              o.cqc_number && `CQC: ${o.cqc_number}`,
              o.ofsted_urn && `Ofsted: ${o.ofsted_urn}`,
              o.charity_number && `Charity: ${o.charity_number}`,
              o.la_gss_code && `GSS: ${o.la_gss_code}`,
              o.us_npi && `NPI: ${o.us_npi}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Not provided"}
          </p>
          {o.other_registration_note && (
            <p className="text-[12px] text-subheading mt-1 whitespace-pre-wrap">
              {o.other_registration_note}
            </p>
          )}
        </Section>
        <Section title="Booker" href="/m/org/register/step-5">
          <p className="text-[14px] text-heading">
            {data.me?.full_name ?? "—"} · {data.me?.job_title ?? "—"}
          </p>
          <p className="text-[12px] text-subheading">
            {data.me?.work_email ?? "—"} · {data.me?.phone ?? "—"}{" "}
            {data.me?.is_signatory && "· authorised signatory"}
            {o.free_email_override && " · free-email override"}
          </p>
        </Section>
        <Section title="Billing" href="/m/org/register/step-6">
          <p className="text-[14px] text-heading">
            {data.billing?.billing_contact_name ?? "—"}
          </p>
          <p className="text-[12px] text-subheading">
            {data.billing?.billing_contact_email ?? "—"} ·{" "}
            {(data.billing?.default_terms ?? "net_14").replace("_", " ")}
            {data.billing?.po_required &&
              ` · PO ${data.billing.po_mode ?? "tbd"}`}
          </p>
        </Section>
        <Section title="Documents" href="/m/org/register/step-7">
          <ul className="text-[12px] text-subheading space-y-0.5">
            {data.documents.length === 0 && <li>No documents uploaded.</li>}
            {data.documents.map((d, i) => (
              <li key={`${d.kind}:${i}`}>
                ✓ {DOC_KIND_LABEL[d.kind]}{" "}
                {d.filename && (
                  <span className="text-[11px]">— {d.filename}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Signed contracts" href="/m/org/register/step-7-5">
          {contracts.length === 0 ? (
            <p className="text-[12px] text-subheading">
              Not signed yet — head back to step 8 to sign the MSA + DPA.
            </p>
          ) : (
            <ul className="text-[12px] text-subheading space-y-0.5">
              {contracts.map((c) => (
                <li key={c.id}>
                  ✓ {c.contract_type.toUpperCase()} ·{" "}
                  <span className="text-[11px]">{c.version}</span>
                  {c.signed_at && (
                    <span className="text-[11px]">
                      {" "}
                      · signed{" "}
                      {new Date(c.signed_at).toLocaleDateString("en-GB")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Card>

      <p className="mt-5 text-[12px] text-subheading">
        By submitting you confirm you&rsquo;re an authorised representative
        of the organisation and agree to SpecialCarer&rsquo;s organisation
        terms.
      </p>
      {err && <p className="mt-2 text-[12px] text-rose-700">{err}</p>}
      <div className="mt-3">
        <Button block disabled={busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit for verification"}
        </Button>
      </div>
    </RegShell>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line first:border-t-0 first:pt-0 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-subheading">
          {title}
        </p>
        <Link
          href={href}
          className="text-[12px] font-semibold text-primary"
        >
          Edit
        </Link>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
