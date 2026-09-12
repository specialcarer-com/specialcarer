/**
 * /settings/danger-zone
 *
 * Home for the self-service account-deletion UI (Phase C — PR C5).
 *
 * Server component only decides:
 *   - is the caller signed in?
 *   - is the feature flag on?
 *   - what deletion jobs already exist for this user?
 *
 * All interactive state lives in DangerZoneClient. Coexists with the
 * existing hard-delete page at /account/delete (kept intact for the
 * fallback path used by internal ops).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import DangerZoneClient, { type DeletionJobSummary } from "./danger-zone-client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Danger zone — SpecialCarer",
};

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SELF_SERVICE_DELETION_ENABLED === "true";
}

type SearchParams = { [k: string]: string | string[] | undefined };

export default async function DangerZonePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/settings/danger-zone");

  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

  const enabled = featureEnabled();

  let jobs: DeletionJobSummary[] = [];
  if (enabled) {
    // RLS on account_deletion_jobs restricts this to rows the user
    // owns. The server-side client has the caller's session so this
    // is safe.
    const { data, error } = await supabase
      .from("account_deletion_jobs")
      .select(
        "id, state, requested_at, verified_at, completed_at, cancelled_at, blocker_codes, blocked_reason",
      )
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(10);
    // schema_not_ready is a real possibility until the migration lands;
    // fall through to enabled=true with no history rather than 500.
    if (!error && data) jobs = data as DeletionJobSummary[];
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/brand/logo.svg"
              alt="SpecialCarer"
              width={161}
              height={121}
              className="h-9 w-auto"
              priority
            />
          </Link>
          <span className="text-sm text-slate-600 hidden sm:inline">
            {user.email}
          </span>
        </div>
      </header>

      <div className="flex-1 px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <nav className="text-sm text-slate-500 mb-4">
            <Link href="/settings" className="hover:underline">
              Settings
            </Link>{" "}
            / Danger zone
          </nav>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Danger zone
          </h1>
          <p className="text-slate-600 mb-8">
            Actions here permanently affect your SpecialCarer account.
            Nothing on this page happens instantly &mdash; every action
            requires confirmation.
          </p>

          {!enabled ? (
            <FeatureDisabledCard />
          ) : (
            <DangerZoneClient
              userEmail={user.email ?? ""}
              tokenFromEmail={token}
              initialJobs={jobs}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function FeatureDisabledCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">
        Self-service account deletion
      </h2>
      <p className="text-slate-600 mb-4">
        This is coming soon. If you need to delete your account today,
        please contact us at{" "}
        <a
          className="text-teal-700 underline"
          href="mailto:dpo@specialcarer.com"
        >
          dpo@specialcarer.com
        </a>
        .
      </p>
      <Link
        href="/account/delete"
        className="text-sm text-slate-700 underline"
      >
        Or use the classic deletion flow &rarr;
      </Link>
    </div>
  );
}
