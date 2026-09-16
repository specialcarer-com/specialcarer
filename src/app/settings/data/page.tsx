/**
 * /settings/data
 *
 * Home for the self-service DSAR request UI (PR E2). Users can request
 * `access`, `rectification` or `portability` here; erasure lives at
 * /settings/danger-zone (linked from the client component).
 *
 * Generally available as of Phase F1c.
 *
 * All interactive state lives in <DataRightsClient>. This server
 * component only:
 *   - checks the caller is signed in
 *   - loads the caller's existing dsar_requests (via the
 *     `dsar_requests_subject_read` RLS policy — `subject_user_id =
 *     auth.uid()`)
 *   - loads their existing account_deletion_jobs (read-only) so the
 *     user can see them without leaving the page.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import DataRightsClient, {
  type DsarRequestSummary,
  type DeletionJobSummary,
} from "./data-rights-client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your data — SpecialCarer",
};

export default async function DataRightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/settings/data");

  // Both selects rely on RLS to scope to the caller's own rows. If the
  // migration hasn't landed yet the queries error cleanly — we fall
  // through with empty lists rather than 500.
  let dsars: DsarRequestSummary[] = [];
  {
    const { data, error } = await supabase
      .from("dsar_requests")
      .select(
        "id, request_type, state, created_at, verified_at, delivered_at, delivery_object_path",
      )
      .eq("subject_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) dsars = data as DsarRequestSummary[];
  }

  let deletionJobs: DeletionJobSummary[] = [];
  {
    const { data, error } = await supabase
      .from("account_deletion_jobs")
      .select(
        "id, state, requested_at, verified_at, completed_at, cancelled_at, blocker_codes",
      )
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(5);
    if (!error && data) deletionJobs = data as DeletionJobSummary[];
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
            / Your data
          </nav>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Your data
          </h1>
          <p className="text-slate-600 mb-8">
            Exercise the rights you have under UK and EU data protection
            law. Access, rectification and portability requests are
            handled here. To close your account (erasure), visit the{" "}
            <Link
              href="/settings/danger-zone"
              className="text-teal-700 underline"
            >
              danger zone
            </Link>
            .
          </p>

          <DataRightsClient
            subjectUserId={user.id}
            subjectEmail={user.email ?? ""}
            initialDsars={dsars}
            initialDeletionJobs={deletionJobs}
          />
        </div>
      </div>
    </main>
  );
}
