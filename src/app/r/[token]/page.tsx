import { createAdminClient } from "@/lib/supabase/admin";
import { isReferenceType } from "@/lib/vetting/reference-cqc";
import RefereeForm from "./RefereeForm";

export const dynamic = "force-dynamic";

type RefRow = {
  id: string;
  carer_id: string;
  referee_name: string;
  referee_email: string;
  reference_type: string | null;
  status: string;
  token_expires_at: string;
};

type CarerProfile = {
  display_name: string | null;
};

export default async function RefereePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("carer_references")
    .select("id, carer_id, referee_name, referee_email, reference_type, status, token_expires_at")
    .eq("token", token)
    .maybeSingle<RefRow>();

  if (!row) {
    return (
      <Shell title="Reference link not found">
        <p>This reference link is no longer valid. Please ask the carer who
        invited you to send a fresh invitation.</p>
      </Shell>
    );
  }
  const expired = new Date(row.token_expires_at).getTime() < Date.now();
  if (expired || row.status === "expired") {
    return (
      <Shell title="This link has expired">
        <p>This reference link expired on{" "}
        <strong>
          {new Date(row.token_expires_at).toLocaleDateString("en-GB")}
        </strong>
        . Please ask the carer to invite you again.</p>
      </Shell>
    );
  }
  if (row.status !== "invited") {
    return (
      <Shell title="Already submitted">
        <p>Thank you — we've already received your reference for this carer.
        You don't need to do anything else.</p>
      </Shell>
    );
  }

  const { data: prof } = await admin
    .from("caregiver_profiles")
    .select("display_name")
    .eq("user_id", row.carer_id)
    .maybeSingle<CarerProfile>();
  const carerName = prof?.display_name ?? "this carer";
  const { data: consent } = await admin
    .from("carer_reference_consents")
    .select("pdf_storage_path, revoked_at")
    .eq("carer_id", row.carer_id)
    .is("revoked_at", null)
    .maybeSingle<{ pdf_storage_path: string | null; revoked_at: string | null }>();
  const consentUrl = consent?.pdf_storage_path
    ? (await admin.storage.from("reference-consents").createSignedUrl(consent.pdf_storage_path, 10 * 60)).data?.signedUrl ?? null
    : null;

  return (
    <Shell title={`Reference for ${carerName}`}>
      <p className="mb-4 text-sm text-slate-600">
        Hi {row.referee_name}, {carerName} has listed you as a reference.
        Your answers help families know who they're inviting into their
        homes. This takes ~2 minutes.
      </p>
      {consentUrl ? (
        <a href={consentUrl} target="_blank" rel="noreferrer" className="mb-4 inline-flex rounded-xl border border-[#039EA0] px-3 py-2 text-sm font-semibold text-[#039EA0] hover:bg-[#039EA0]/5">View candidate’s consent</a>
      ) : (
        <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The candidate has not yet signed a data-sharing consent. You may still provide this reference; the candidate will be prompted to sign after.</div>
      )}
      <RefereeForm
        token={token}
        carerName={carerName}
        refereeName={row.referee_name}
        refereeEmail={row.referee_email}
        initialReferenceType={
          row.reference_type && isReferenceType(row.reference_type)
            ? row.reference_type
            : null
        }
      />
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">{title}</h1>
        <div className="text-slate-700 leading-relaxed">{children}</div>
        <p className="mt-8 text-xs text-slate-500">
          SpecialCarer · A product of All Care 4 U Group Ltd
        </p>
      </div>
    </main>
  );
}
