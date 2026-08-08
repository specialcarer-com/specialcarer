import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  REFERENCE_TYPE_LABEL,
  REFERENCE_TYPES,
  type ReferenceType,
  type YesNoUnsure,
} from "@/lib/vetting/types";
import RefRowActions from "./RefRowActions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  carer_id: string;
  referee_name: string;
  referee_email: string;
  relationship: string | null;
  reference_type: ReferenceType | null;
  status: string;
  rating: number | null;
  recommend: boolean | null;
  comment: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  rejected_reason: string | null;
  employment_start: string | null;
  employment_end: string | null;
  still_employed: boolean | null;
  position_held: string | null;
  weekly_hours: number | null;
  reason_for_leaving: string | null;
  absence_days_12m: number | null;
  sponsors_visa: string | null;
  warnings_undisposed: YesNoUnsure | null;
  under_investigation: YesNoUnsure | null;
  safeguarding_dbs: YesNoUnsure | null;
  would_reemploy: YesNoUnsure | null;
  values_example: string | null;
  referee_position: string | null;
  referee_company: string | null;
  referee_company_addr: string | null;
  referee_signed_date: string | null;
  admin_notes: string | null;
  created_at: string;
};

export default async function ReferencesQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; reference_type?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = sp.filter ?? "submitted";
  const referenceType = REFERENCE_TYPES.includes(
    sp.reference_type as ReferenceType,
  )
    ? (sp.reference_type as ReferenceType)
    : "all";
  const admin = createAdminClient();
  let q = admin
    .from("carer_references")
    .select(
      "id, carer_id, referee_name, referee_email, relationship, reference_type, status, rating, recommend, comment, submitted_at, verified_at, rejected_reason, employment_start, employment_end, still_employed, position_held, weekly_hours, reason_for_leaving, absence_days_12m, sponsors_visa, warnings_undisposed, under_investigation, safeguarding_dbs, would_reemploy, values_example, referee_position, referee_company, referee_company_addr, referee_signed_date, admin_notes, created_at",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (filter !== "all") {
    q = q.eq("status", filter);
  }
  if (referenceType !== "all") {
    q = q.eq("reference_type", referenceType);
  }
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Carer references
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Submitted references awaiting verification.
          </p>
        </div>
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; safety
        </Link>
      </div>

      <div className="flex gap-2 text-xs">
        {["submitted", "verified", "rejected", "expired", "all"].map((f) => (
          <Link
            key={f}
            href={`/admin/trust-safety/references?filter=${f}`}
            className={`px-3 py-1.5 rounded-full border ${
              filter === f
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {f}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="self-center font-semibold text-slate-600">
          Reference type:
        </span>
        {(["all", ...REFERENCE_TYPES] as const).map((type) => (
          <Link
            key={type}
            href={`/admin/trust-safety/references?filter=${filter}&reference_type=${type}`}
            className={`px-3 py-1.5 rounded-full border ${
              referenceType === type
                ? "bg-[#039EA0] text-white border-[#039EA0]"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {type === "all" ? "All types" : REFERENCE_TYPE_LABEL[type]}
          </Link>
        ))}
      </div>

      <ul className="space-y-3">
        {rows.length === 0 && (
          <li className="text-sm text-slate-500">Nothing in this queue.</li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl bg-white border border-slate-200 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {r.referee_name}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    {r.relationship ? `· ${r.relationship}` : ""}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  {r.referee_email} · for carer {r.carer_id.slice(0, 8)}…
                </p>
                <span className="mt-2 inline-flex rounded-full border border-[#039EA0]/20 bg-[#F4EFE6] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#0F1416]">
                  {(r.reference_type ?? "employer").toUpperCase()}
                </span>
                {r.rating != null && (
                  <p className="text-xs text-slate-500 mt-1">
                    Rated {r.rating}/5
                    {r.recommend === true ? " · would recommend" : ""}
                    {r.recommend === false ? " · would NOT recommend" : ""}
                  </p>
                )}
                {r.comment && (
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                    {r.comment}
                  </p>
                )}
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full border bg-slate-50 border-slate-200 font-semibold">
                {r.status}
              </span>
            </div>
            <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
              <Details
                title="Employment details"
                items={[
                  ["Start date", displayDate(r.employment_start)],
                  ["End date", r.still_employed ? "Still employed" : displayDate(r.employment_end)],
                  ["Position", r.position_held],
                  ["Weekly hours", r.weekly_hours?.toString() ?? null],
                  ["Reason for leaving", r.reason_for_leaving],
                  ["Days absent (12 months)", r.absence_days_12m?.toString() ?? null],
                  ["Visa sponsorship", r.sponsors_visa],
                ]}
              />
              <Details
                title="Referee details"
                items={[
                  ["Position", r.referee_position],
                  ["Company", r.referee_company],
                  ["Company address", r.referee_company_addr],
                  ["Signed date", displayDate(r.referee_signed_date)],
                ]}
              />
            </div>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                Conduct and safeguarding declarations
              </p>
              <div className="flex flex-wrap gap-2">
                <AnswerPill label="Warnings" value={r.warnings_undisposed} />
                <AnswerPill label="Investigation" value={r.under_investigation} />
                <AnswerPill label="Safeguarding / DBS" value={r.safeguarding_dbs} />
                <AnswerPill label="Would re-employ" value={r.would_reemploy} />
              </div>
            </div>
            {r.values_example && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Values example
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {r.values_example}
                </p>
              </div>
            )}
            {r.admin_notes && (
              <p className="mt-3 text-xs text-slate-600">
                <strong>Admin notes:</strong> {r.admin_notes}
              </p>
            )}
            {r.status === "submitted" && (
              <div className="mt-3">
                <RefRowActions id={r.id} safeguardingDbs={r.safeguarding_dbs} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Details({
  title,
  items,
}: {
  title: string;
  items: [string, string | null][];
}) {
  const present = items.filter(([, value]) => value);
  if (present.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">
        {title}
      </p>
      <dl className="space-y-1">
        {present.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="min-w-28 text-slate-500">{label}</dt>
            <dd className="whitespace-pre-wrap text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AnswerPill({
  label,
  value,
}: {
  label: string;
  value: YesNoUnsure | null;
}) {
  const tone =
    value === "yes"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : value === "no"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tone}`}>
      {label}: {value ? value.toUpperCase() : "MISSING"}
    </span>
  );
}

function displayDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB");
}
