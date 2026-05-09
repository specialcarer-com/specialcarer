import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/org/types";
import OrgRowActions from "./OrgRowActions";

export const dynamic = "force-dynamic";

type DocRow = {
  id: string;
  kind: DocKind;
  filename: string | null;
  mime_type: string | null;
  storage_path: string;
  uploaded_at: string;
  verified: boolean;
  signed_url?: string | null;
};

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const [membersRes, docsRes, billingRes, contractsRes] = await Promise.all([
    admin
      .from("organization_members")
      .select(
        "id, user_id, full_name, work_email, phone, job_title, job_title_other, is_signatory, role",
      )
      .eq("organization_id", id),
    admin
      .from("organization_documents")
      .select(
        "id, kind, filename, mime_type, storage_path, uploaded_at, verified",
      )
      .eq("organization_id", id)
      .order("uploaded_at", { ascending: false }),
    admin
      .from("organization_billing")
      .select(
        "billing_contact_name, billing_contact_email, billing_address, po_required, po_mode, default_terms",
      )
      .eq("organization_id", id)
      .maybeSingle(),
    admin
      .from("organization_contracts")
      .select(
        "id, contract_type, version, status, signed_by_name, signed_by_role, signed_at, signature_ip, signature_user_agent, countersigned_at, signed_pdf_storage_path, legal_review_comment",
      )
      .eq("organization_id", id)
      .order("contract_type", { ascending: true }),
  ]);

  type ContractRow = {
    id: string;
    contract_type: "msa" | "dpa";
    version: string;
    status: string;
    signed_by_name: string | null;
    signed_by_role: string | null;
    signed_at: string | null;
    signature_ip: string | null;
    signature_user_agent: string | null;
    countersigned_at: string | null;
    signed_pdf_storage_path: string | null;
    legal_review_comment: string | null;
    signed_url?: string | null;
  };
  const baseContracts = (contractsRes.data ?? []) as ContractRow[];
  const contracts: ContractRow[] = await Promise.all(
    baseContracts.map(async (c) => {
      if (!c.signed_pdf_storage_path) return c;
      try {
        const { data: s } = await admin.storage
          .from("organization-documents")
          .createSignedUrl(c.signed_pdf_storage_path, 3600);
        return { ...c, signed_url: s?.signedUrl ?? null };
      } catch {
        return { ...c, signed_url: null };
      }
    }),
  );

  type DocBase = {
    id: string;
    kind: DocKind;
    filename: string | null;
    mime_type: string | null;
    storage_path: string;
    uploaded_at: string;
    verified: boolean;
  };
  const baseDocs = (docsRes.data ?? []) as DocBase[];
  const docs: DocRow[] = await Promise.all(
    baseDocs.map(async (d) => {
      try {
        const { data: signed } = await admin.storage
          .from("organization-documents")
          .createSignedUrl(d.storage_path, 3600);
        return { ...d, signed_url: signed?.signedUrl ?? null };
      } catch {
        return { ...d, signed_url: null };
      }
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          {org.legal_name ?? "(no legal name)"}
        </h1>
        <Link
          href="/admin/orgs"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to queue
        </Link>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Identity
        </p>
        <p>
          <strong>{org.legal_name}</strong>
          {org.trading_name && ` (trading as ${org.trading_name})`}
        </p>
        <p className="text-sm text-slate-700">
          {org.country} · {org.org_type} · size {org.size_band ?? "?"}
        </p>
        <p className="text-sm text-slate-700">
          {[
            org.companies_house_number && `CH ${org.companies_house_number}`,
            org.ein && `EIN ${org.ein}`,
            org.cqc_number && `CQC ${org.cqc_number}`,
            org.ofsted_urn && `Ofsted ${org.ofsted_urn}`,
            org.charity_number && `Charity ${org.charity_number}`,
            org.la_gss_code && `GSS ${org.la_gss_code}`,
            org.us_npi && `NPI ${org.us_npi}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {org.other_registration_note && (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            Note: {org.other_registration_note}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Submitted{" "}
          {org.submitted_at
            ? new Date(org.submitted_at).toLocaleString("en-GB")
            : "—"}
        </p>
        {org.free_email_override && (
          <p className="text-xs text-amber-700">
            ⚠ Free-webmail booker email — strict review
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Booker / member
        </p>
        {(membersRes.data ?? []).map((m) => (
          <div key={m.id} className="text-sm text-slate-700">
            <p>
              <strong>{m.full_name ?? "—"}</strong>
              {" — "}
              {m.job_title === "Other" ? m.job_title_other : m.job_title}
              {m.is_signatory && " · signatory"}
            </p>
            <p className="text-xs text-slate-500">
              {m.work_email ?? "—"} · {m.phone ?? "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Billing
        </p>
        {billingRes.data ? (
          <div className="text-sm text-slate-700">
            <p>{billingRes.data.billing_contact_name ?? "—"}</p>
            <p className="text-xs text-slate-500">
              {billingRes.data.billing_contact_email ?? "—"} ·{" "}
              {(billingRes.data.default_terms ?? "net_14").replace("_", " ")}
              {billingRes.data.po_required &&
                ` · PO ${billingRes.data.po_mode ?? "tbd"}`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No billing record.</p>
        )}
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
          Documents
        </p>
        {docs.length === 0 && (
          <p className="text-sm text-slate-500">No documents uploaded.</p>
        )}
        <ul className="space-y-3">
          {docs.map((d) => {
            const isImage = (d.mime_type ?? "").startsWith("image/");
            return (
              <li
                key={d.id}
                className="border border-slate-200 rounded-xl p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {DOC_KIND_LABEL[d.kind]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {d.filename ?? "—"} ·{" "}
                      {new Date(d.uploaded_at).toLocaleString("en-GB")}
                    </p>
                  </div>
                  {d.signed_url && (
                    <a
                      href={d.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-slate-900 underline whitespace-nowrap"
                    >
                      Open file →
                    </a>
                  )}
                </div>
                {d.signed_url && isImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.signed_url}
                    alt=""
                    className="mt-2 max-h-60 rounded-lg border border-slate-200"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
          Contracts
        </p>
        {contracts.length === 0 ? (
          <p className="text-sm text-slate-500">
            Org hasn&rsquo;t reached step 7.5 yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {contracts.map((c) => (
              <li
                key={c.id}
                className="border border-slate-200 rounded-xl p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {c.contract_type.toUpperCase()} —{" "}
                      <span className="font-mono text-xs text-slate-500">
                        {c.version}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Status: <strong>{c.status}</strong>
                      {c.signed_at &&
                        ` · signed ${new Date(c.signed_at).toLocaleString("en-GB")}`}
                      {c.signed_by_name &&
                        ` by ${c.signed_by_name} (${c.signed_by_role ?? "—"})`}
                    </p>
                    {c.signature_ip && (
                      <p className="text-[11px] text-slate-500">
                        IP: {c.signature_ip} · UA:{" "}
                        {c.signature_user_agent
                          ? c.signature_user_agent.slice(0, 80)
                          : "—"}
                      </p>
                    )}
                    {c.legal_review_comment && (
                      <p className="text-[11px] text-amber-700 mt-1 whitespace-pre-wrap">
                        Legal-review note: {c.legal_review_comment}
                      </p>
                    )}
                    {c.countersigned_at && (
                      <p className="text-[11px] text-emerald-700">
                        Countersigned{" "}
                        {new Date(c.countersigned_at).toLocaleString("en-GB")}
                      </p>
                    )}
                  </div>
                  {c.signed_url ? (
                    <a
                      href={c.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-slate-900 underline whitespace-nowrap"
                    >
                      Download signed PDF →
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">
                      PDF generated on approval
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <OrgRowActions
        orgId={org.id}
        currentStatus={org.verification_status}
      />
    </div>
  );
}
