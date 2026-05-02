import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import VerificationClient from "./verification-client";

export const dynamic = "force-dynamic";

const REQUIRED = [
  {
    type: "enhanced_dbs_barred",
    label: "Enhanced DBS with Barred Lists",
    blurb:
      "Statutory check for regulated activity (children + adults). Issued by the Disclosure & Barring Service.",
  },
  {
    type: "right_to_work",
    label: "Right to Work",
    blurb:
      "Confirms your legal right to work in the UK. Required by HMRC for any worker.",
  },
  {
    type: "digital_id",
    label: "Digital ID Verification",
    blurb:
      "Identity verification matching your face to your ID document. Required for DBS submission.",
  },
] as const;

type CheckRow = {
  check_type: string;
  status: string;
  invite_url: string | null;
  issued_at: string | null;
  expires_at: string | null;
  result_summary: string | null;
};

function statusLabel(s: string): {
  label: string;
  tone: "neutral" | "amber" | "emerald" | "rose";
} {
  switch (s) {
    case "cleared":
      return { label: "Cleared", tone: "emerald" };
    case "consider":
      return { label: "Needs review", tone: "amber" };
    case "failed":
      return { label: "Failed", tone: "rose" };
    case "expired":
      return { label: "Expired", tone: "rose" };
    case "cancelled":
      return { label: "Cancelled", tone: "rose" };
    case "in_progress":
    case "submitted":
    case "pending_result":
      return { label: "In progress", tone: "amber" };
    case "invited":
      return { label: "Invitation sent", tone: "amber" };
    default:
      return { label: "Not started", tone: "neutral" };
  }
}

export default async function VerificationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/verification");

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("role, country, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "caregiver") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold">Verification</h1>
        <p className="text-slate-600 mt-2">
          Background checks are only required for caregivers.
        </p>
      </div>
    );
  }

  const { data: rows } = await admin
    .from("background_checks")
    .select(
      "check_type, status, invite_url, issued_at, expires_at, result_summary"
    )
    .eq("user_id", user.id)
    .eq("vendor", "uchecks");

  const byType = new Map<string, CheckRow>();
  (rows ?? []).forEach((r) => byType.set(r.check_type, r as CheckRow));

  const inviteUrl =
    (rows ?? []).find((r) => r.invite_url)?.invite_url ?? null;
  const allCleared = REQUIRED.every(
    (r) => byType.get(r.type)?.status === "cleared"
  );
  const anyStarted = (rows ?? []).length > 0;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Dashboard
      </Link>
      <h1 className="text-3xl font-semibold mt-2">Verification</h1>
      <p className="text-slate-600 mt-1">
        We verify every UK caregiver before they can be booked. SpecialCarer
        covers the cost &mdash; you pay nothing.
      </p>

      {profile.country && profile.country !== "GB" ? (
        <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          Your account country is set to <strong>{profile.country}</strong>.
          uCheck only supports UK caregivers; US verification (Checkr) is coming
          soon.
        </div>
      ) : null}

      {allCleared && (
        <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
          ✅ All checks cleared. You&rsquo;re fully verified and bookable.
        </div>
      )}

      <ol className="mt-8 space-y-3">
        {REQUIRED.map((req) => {
          const row = byType.get(req.type);
          const s = statusLabel(row?.status ?? "not_started");
          const tone =
            s.tone === "emerald"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : s.tone === "amber"
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : s.tone === "rose"
              ? "bg-rose-50 text-rose-700 border-rose-200"
              : "bg-slate-100 text-slate-600 border-slate-200";

          return (
            <li
              key={req.type}
              className="p-5 rounded-2xl bg-white border border-slate-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium">{req.label}</h2>
                  <p className="text-sm text-slate-500 mt-1">{req.blurb}</p>
                  {row?.result_summary && (
                    <p className="text-xs text-slate-500 mt-2">
                      {row.result_summary}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${tone}`}
                >
                  {s.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 p-6 rounded-2xl bg-white border border-slate-200">
        <h2 className="font-medium">
          {anyStarted ? "Continue your verification" : "Start your verification"}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {anyStarted
            ? "Pick up where you left off in the secure uCheck portal."
            : "We&rsquo;ll redirect you to uCheck to verify your ID and submit your DBS check. Takes about 10 minutes."}
        </p>
        <div className="mt-4">
          <VerificationClient
            inviteUrl={inviteUrl}
            allCleared={allCleared}
            country={(profile.country as "GB" | "US") ?? "GB"}
          />
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-6">
        SpecialCarer uses uCheck, a DBS Responsible Organisation, to run your
        Enhanced DBS, Right-to-Work and Digital ID checks. We never see your
        passport or DBS certificate &mdash; uCheck holds them securely under
        UK GDPR.
      </p>
    </div>
  );
}
