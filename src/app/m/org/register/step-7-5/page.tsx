import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import {
  CURRENT_DPA_VERSION,
  CURRENT_MSA_VERSION,
  getContractMarkdown,
} from "@/contracts";
import ContractsClient from "./ContractsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign agreements — SpecialCarer" };

export default async function Step7p5Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/register/step-7-5");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  const msa = getContractMarkdown(CURRENT_MSA_VERSION);
  const dpa = getContractMarkdown(CURRENT_DPA_VERSION);

  return (
    <ContractsClient
      orgLegalName={org.legal_name ?? "your organisation"}
      bookerName={member.full_name ?? ""}
      bookerJobTitle={
        member.job_title === "Other"
          ? member.job_title_other ?? ""
          : member.job_title ?? ""
      }
      msaVersion={CURRENT_MSA_VERSION}
      dpaVersion={CURRENT_DPA_VERSION}
      msaMarkdown={msa}
      dpaMarkdown={dpa}
    />
  );
}
