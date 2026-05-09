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

  const { data } = await admin
    .from("organization_documents")
    .select(
      "id, kind, filename, uploaded_at, verified, rejection_reason, storage_path",
    )
    .eq("organization_id", org.id)
    .order("uploaded_at", { ascending: false });
  const docs = (data ?? []) as DocRow[];

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
