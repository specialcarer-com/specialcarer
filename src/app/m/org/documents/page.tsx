import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card, Tag } from "../../_components/ui";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/org/types";

export const dynamic = "force-dynamic";

type DocRow = {
  id: string;
  kind: DocKind;
  filename: string | null;
  uploaded_at: string;
  verified: boolean;
  rejection_reason: string | null;
  storage_path: string;
};

type ContractRow = {
  id: string;
  contract_type: "msa" | "dpa";
  version: string;
  status: string;
  signed_at: string | null;
  countersigned_at: string | null;
  signed_pdf_storage_path: string | null;
  signed_url?: string | null;
};

export default async function OrgDocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/documents");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  const [docsRes, contractsRes] = await Promise.all([
    admin
      .from("organization_documents")
      .select(
        "id, kind, filename, uploaded_at, verified, rejection_reason, storage_path",
      )
      .eq("organization_id", org.id)
      .order("uploaded_at", { ascending: false }),
    admin
      .from("organization_contracts")
      .select(
        "id, contract_type, version, status, signed_at, countersigned_at, signed_pdf_storage_path",
      )
      .eq("organization_id", org.id)
      .order("contract_type", { ascending: true }),
  ]);
  const docs = (docsRes.data ?? []) as DocRow[];
  const contractsBase = (contractsRes.data ?? []) as ContractRow[];
  const contracts: ContractRow[] = await Promise.all(
    contractsBase.map(async (c) => {
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

  return (
    <OrgShell
      title="Documents"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <Card className="p-4">
        {docs.length === 0 ? (
          <p className="text-[13px] text-subheading">
            No documents yet.{" "}
            <Link
              href="/m/org/register/step-7"
              className="text-primary font-semibold"
            >
              Upload now
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {docs.map((d) => (
              <li
                key={d.id}
                className="rounded-card border border-line p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-heading">
                      {DOC_KIND_LABEL[d.kind]}
                    </p>
                    <p className="text-[12px] text-subheading">
                      {d.filename ?? "Uploaded"} ·{" "}
                      {new Date(d.uploaded_at).toLocaleDateString("en-GB")}
                    </p>
                    {d.rejection_reason && (
                      <p className="text-[12px] text-rose-700 mt-1">
                        {d.rejection_reason}
                      </p>
                    )}
                  </div>
                  <Tag tone={d.verified ? "green" : "amber"}>
                    {d.verified ? "Verified" : "Pending"}
                  </Tag>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-4 mt-3">
        <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
          Signed contracts
        </p>
        {contracts.length === 0 ? (
          <p className="text-[13px] text-subheading">
            You haven&rsquo;t signed the MSA + DPA yet.{" "}
            <Link
              href="/m/org/register/step-7-5"
              className="text-primary font-semibold"
            >
              Sign now
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {contracts.map((c) => (
              <li
                key={c.id}
                className="rounded-card border border-line p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-heading">
                      {c.contract_type === "msa"
                        ? "Master Services Agreement"
                        : "Data Processing Addendum"}
                    </p>
                    <p className="text-[11px] text-subheading">
                      Version {c.version}
                      {c.signed_at &&
                        ` · signed ${new Date(c.signed_at).toLocaleDateString("en-GB")}`}
                      {c.countersigned_at &&
                        ` · countersigned ${new Date(c.countersigned_at).toLocaleDateString("en-GB")}`}
                    </p>
                  </div>
                  <Tag tone={c.status === "active" ? "green" : "amber"}>
                    {c.status}
                  </Tag>
                </div>
                {c.signed_url ? (
                  <a
                    href={c.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-[12px] font-semibold text-primary"
                  >
                    Download signed PDF →
                  </a>
                ) : (
                  <p className="mt-2 text-[11px] text-subheading">
                    Countersigned PDF arrives once we approve your account.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-center text-[12px]">
        <Link
          href="/m/org/register/step-7"
          className="text-primary font-semibold"
        >
          Upload or replace documents
        </Link>
      </p>
    </OrgShell>
  );
}
