import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDbsEnabled } from "@/lib/dbs/flag";
import DbsDecisionForm from "./DbsDecisionForm";
import RerunCrossCheckButton from "./RerunCrossCheckButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "DBS application — Admin" };

export default async function AdminDbsDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  await requireAdmin();
  const { applicationId } = await params;

  if (!isDbsEnabled()) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        DBS verification is disabled. Set NEXT_PUBLIC_DBS_ENABLED=true.
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("dbs_applications")
    .select(
      "id, carer_id, kind, status, vendor, vendor_reference, submitted_at, decision_at, certificate_number, certificate_issued_on, recovery_status, recovery_collected_pence, cost_pence, cross_check_passed, cross_check_run_at, cross_check_mismatches, update_service_enrolled, update_service_last_checked_at, surname_override_by, surname_override_reason, created_at",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (!app) notFound();

  // Carer info — public-facing caregiver_profiles fields + profile name/avatar.
  const { data: profile } = await admin
    .from("caregiver_profiles")
    .select("user_id, display_name, photo_url, city, region, country, location_postcode")
    .eq("user_id", app.carer_id)
    .maybeSingle();
  const { data: baseProfile } = await admin
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", app.carer_id)
    .maybeSingle();

  // Sibling application (the other kind) for at-a-glance context.
  const { data: siblings } = await admin
    .from("dbs_applications")
    .select("kind, status")
    .eq("carer_id", app.carer_id);

  const name =
    baseProfile?.full_name ?? profile?.display_name ?? "Unknown carer";
  const headshot = profile?.photo_url ?? baseProfile?.avatar_url ?? null;
  const collected = ((app.recovery_collected_pence ?? 0) / 100).toFixed(2);
  const cost = ((app.cost_pence ?? 6000) / 100).toFixed(2);

  return (
    <div
      className="space-y-6 max-w-3xl"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <Link href="/admin/dbs" className="text-sm text-slate-500 hover:text-slate-700">
        ← Back to DBS queue
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-4">
          {headshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headshot}
              alt=""
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-200" />
          )}
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{name}</h1>
            <p className="text-sm text-slate-500">
              {[profile?.city, profile?.region, profile?.country]
                .filter(Boolean)
                .join(", ") || "—"}
              {profile?.location_postcode ? ` · ${profile.location_postcode}` : ""}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">Workforce</dt>
            <dd className="capitalize font-medium text-slate-900">{app.kind}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="capitalize font-medium text-slate-900">
              {String(app.status).replace("_", " ")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Vendor</dt>
            <dd className="font-medium text-slate-900">
              {app.vendor ?? "—"}
              {app.vendor_reference ? ` (${app.vendor_reference})` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Submitted</dt>
            <dd className="font-medium text-slate-900">
              {app.submitted_at
                ? new Date(app.submitted_at).toLocaleString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Cost recovery</dt>
            <dd className="font-medium text-slate-900 capitalize">
              {(app.recovery_status ?? "pending").replace("_", " ")} · £{collected}{" "}
              of £{cost}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Both DBS</dt>
            <dd className="font-medium text-slate-900">
              {(siblings ?? [])
                .map((s) => `${s.kind}: ${s.status}`)
                .join(" · ") || "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Identity cross-check
          </h2>
          <RerunCrossCheckButton applicationId={app.id} />
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">Veriff cross-check</dt>
            <dd className="font-medium text-slate-900">
              {app.cross_check_passed === null
                ? "Not run"
                : app.cross_check_passed
                  ? "Pass"
                  : `Mismatch (${
                      Array.isArray(app.cross_check_mismatches)
                        ? (app.cross_check_mismatches as string[]).join(", ")
                        : "—"
                    })`}
              {app.cross_check_run_at
                ? ` · ${new Date(app.cross_check_run_at).toLocaleString()}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Surname override</dt>
            <dd className="font-medium text-slate-900">
              {app.surname_override_by
                ? app.surname_override_reason || "Applied"
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Update Service</dt>
            <dd className="font-medium text-slate-900">
              {app.update_service_enrolled
                ? app.update_service_last_checked_at
                  ? `Enrolled · last checked ${new Date(
                      app.update_service_last_checked_at,
                    ).toLocaleString()}`
                  : "Enrolled · not yet checked"
                : "Not enrolled"}
            </dd>
          </div>
        </dl>
      </div>

      <DbsDecisionForm
        applicationId={app.id}
        currentStatus={String(app.status)}
        recoveryStatus={app.recovery_status ?? "pending"}
        certificateNumber={app.certificate_number ?? ""}
        certificateIssuedOn={app.certificate_issued_on ?? ""}
      />
    </div>
  );
}
