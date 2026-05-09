import { createAdminClient } from "@/lib/supabase/admin";
import RefereeForm from "./RefereeForm";

export const dynamic = "force-dynamic";

type RefRow = {
  id: string;
  carer_id: string;
  referee_name: string;
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
    .select("id, carer_id, referee_name, status, token_expires_at")
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

  return (
    <Shell title={`Reference for ${carerName}`}>
      <p className="mb-4 text-sm text-slate-600">
        Hi {row.referee_name}, {carerName} has listed you as a reference.
        Your answers help families know who they're inviting into their
        homes. This takes ~2 minutes.
      </p>
      <RefereeForm token={token} />
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
