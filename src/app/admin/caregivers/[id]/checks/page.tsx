import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import ClearCheckButton from "./_components/ClearCheckButton";

export const dynamic = "force-dynamic";

const UK_CHECK_TYPES = [
  "enhanced_dbs_barred",
  "right_to_work",
  "digital_id",
] as const;
const US_CHECK_TYPES = ["us_criminal", "us_healthcare_sanctions"] as const;

type BgRow = {
  id: string;
  check_type: string;
  vendor: string | null;
  status: string;
  invite_url: string | null;
  vendor_applicant_id: string | null;
  issued_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const base =
    "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium border";
  switch (status) {
    case "cleared":
      return (
        <span
          className={`${base} text-emerald-700 bg-emerald-50 border-emerald-100`}
        >
          ● Cleared
        </span>
      );
    case "consider":
      return (
        <span
          className={`${base} text-amber-700 bg-amber-50 border-amber-100`}
        >
          ● Consider (review)
        </span>
      );
    case "failed":
      return (
        <span className={`${base} text-rose-700 bg-rose-50 border-rose-100`}>
          ● Failed
        </span>
      );
    case "invited":
    case "in_progress":
      return (
        <span
          className={`${base} text-sky-700 bg-sky-50 border-sky-100`}
        >
          ● {status === "invited" ? "Invited" : "In progress"}
        </span>
      );
    default:
      return (
        <span
          className={`${base} text-slate-600 bg-slate-50 border-slate-200`}
        >
          ● {status || "—"}
        </span>
      );
  }
}

export default async function AdminCaregiverChecksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id: userId } = await params;
  const admin = createAdminClient();

  // 1) Profile
  const { data: profile } = await admin
    .from("caregiver_profiles")
    .select(
      "user_id, display_name, country, is_published, city, public_slug",
    )
    .eq("user_id", userId)
    .maybeSingle<{
      user_id: string;
      display_name: string | null;
      country: "GB" | "US" | null;
      is_published: boolean;
      city: string | null;
      public_slug: string | null;
    }>();
  if (!profile) notFound();

  // 2) Email lookup
  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  const email = userRes?.user?.email ?? null;

  // 3) Existing background_checks rows for this carer
  const { data: bgRows } = await admin
    .from("background_checks")
    .select(
      "id, check_type, vendor, status, invite_url, vendor_applicant_id, issued_at, expires_at, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const rows = (bgRows ?? []) as BgRow[];

  // 4) Group latest row per check_type
  const latestByType = new Map<string, BgRow>();
  for (const r of rows) {
    if (!latestByType.has(r.check_type)) latestByType.set(r.check_type, r);
  }

  const requiredTypes =
    profile.country === "US" ? US_CHECK_TYPES : UK_CHECK_TYPES;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/caregivers"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← All caregivers
        </Link>
        <div className="flex items-baseline gap-3 mt-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            {profile.display_name ?? "(no name)"}
          </h1>
          {profile.is_published ? (
            <span className="text-xs font-medium text-emerald-700">
              Published
            </span>
          ) : (
            <span className="text-xs font-medium text-slate-500">Hidden</span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {email ?? userId.slice(0, 8)} · {profile.city ?? "—"} ·{" "}
          {profile.country ?? "—"}
        </p>
        {profile.public_slug && (
          <Link
            href={`/caregiver/${profile.public_slug}`}
            target="_blank"
            className="text-xs text-brand-700 hover:underline"
          >
            View public profile ↗
          </Link>
        )}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Background check overrides</p>
        <p className="mt-1 text-amber-800">
          Clearing a check here is an admin override that bypasses the vendor
          (uCheck / Veriff / Checkr) decision. Use only when a check has been
          completed out-of-band (paper DBS, in-person ID) and you have evidence
          on file. Every action is recorded in the audit log with your email.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Check type</th>
              <th className="text-left px-4 py-3 font-medium">Vendor</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Issued</th>
              <th className="text-left px-4 py-3 font-medium">Updated</th>
              <th className="text-right px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requiredTypes.map((type) => {
              const row = latestByType.get(type);
              return (
                <tr key={type}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {type.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-slate-500">Required</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs">
                    {row?.vendor ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row ? (
                      statusBadge(row.status)
                    ) : (
                      <span className="text-xs text-slate-400">
                        No check on record
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {fmtDate(row?.issued_at ?? null)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {fmtDate(row?.updated_at ?? row?.created_at ?? null)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ClearCheckButton
                      userId={userId}
                      checkType={type}
                      existingId={row?.id ?? null}
                      currentStatus={row?.status ?? null}
                    />
                  </td>
                </tr>
              );
            })}
            {/* Also show any extra rows that aren't in required (legacy / wrong country) */}
            {rows
              .filter(
                (r) =>
                  !(requiredTypes as readonly string[]).includes(r.check_type),
              )
              .map((r) => (
                <tr key={r.id} className="bg-slate-50/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">
                      {r.check_type.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-slate-400">
                      Not required for {profile.country ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {r.vendor ?? "—"}
                  </td>
                  <td className="px-4 py-3">{statusBadge(r.status)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {fmtDate(r.issued_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {fmtDate(r.updated_at ?? r.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ClearCheckButton
                      userId={userId}
                      checkType={r.check_type}
                      existingId={r.id}
                      currentStatus={r.status}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Replaces ad-hoc SQL. All overrides are written to{" "}
        <code className="text-slate-500">admin_audit_log</code> with action{" "}
        <code className="text-slate-500">checks.clear</code> or{" "}
        <code className="text-slate-500">checks.reset</code>.
      </p>
    </div>
  );
}
