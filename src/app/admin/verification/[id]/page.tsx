import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { KINDS, type KindKey } from "@/lib/verification/kinds";
import DecisionForm from "./DecisionForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review evidence — Admin" };

const BUCKET = "verification-docs";

const HOW_TO: Partial<Record<KindKey, { text: string; href: string }>> = {
  right_to_work: {
    text: "Check the share code and date of birth on the gov.uk employer service, then compare the name and photo.",
    href: "https://www.gov.uk/view-right-to-work",
  },
  dbs: {
    text: "Check the certificate number and date of birth on the DBS Update Service employer check (the carer has consented).",
    href: "https://www.gov.uk/dbs-update-service",
  },
};

export default async function ReviewSubmission({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("verification_submissions")
    .select("id, user_id, kind, status, data, files, consent_at, review_note, reviewed_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!sub || !(sub.kind in KINDS)) notFound();
  const def = KINDS[sub.kind as KindKey];

  const { data: carer } = await admin
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", sub.user_id)
    .maybeSingle();

  // Short-lived links; every time documents are opened it is written to the audit log.
  const links: { key: string; label: string; url: string }[] = [];
  const paths = (sub.files ?? {}) as Record<string, string>;
  for (const [key, path] of Object.entries(paths)) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
    if (data?.signedUrl) {
      links.push({ key, label: def.fields.find((f) => f.key === key)?.label ?? key, url: data.signedUrl });
    }
  }
  if (links.length || Object.keys(sub.data ?? {}).length) {
    await logAdminAction({
      admin: me,
      action: "verification.view",
      targetType: "caregiver",
      targetId: sub.user_id,
      details: { submission_id: sub.id, kind: sub.kind, files_opened: links.length },
    });
  }

  const data = (sub.data ?? {}) as Record<string, string | boolean>;
  const howTo = HOW_TO[def.kind];

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/admin/verification" className="text-sm text-slate-500 hover:text-slate-700">← Queue</Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{def.label}</h1>
        <p className="text-sm text-slate-600">
          {carer?.full_name ?? "Unknown carer"} ·{" "}
          <Link href={`/admin/caregivers/${sub.user_id}/checks`} className="underline">carer checks</Link>
        </p>
      </div>

      {howTo && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {howTo.text}{" "}
          <a href={howTo.href} target="_blank" rel="noopener noreferrer" className="underline">Open service</a>
        </p>
      )}

      <dl className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {def.fields
          .filter((f) => f.type !== "file")
          .map((f) => (
            <div key={f.key}>
              <dt className="text-xs text-slate-500">{f.label}</dt>
              <dd className="whitespace-pre-wrap text-sm text-slate-900">
                {f.type === "checkbox" ? (data[f.key] === true ? "Yes" : "No") : String(data[f.key] ?? "—")}
              </dd>
            </div>
          ))}
        {sub.consent_at && (
          <p className="text-xs text-slate-500">
            Consent to Update Service check recorded {new Date(sub.consent_at).toLocaleString("en-GB")}
          </p>
        )}
      </dl>

      {links.length > 0 && (
        <ul className="space-y-1 text-sm">
          {links.map((l) => (
            <li key={l.key}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline">
                Open: {l.label}
              </a>{" "}
              <span className="text-xs text-slate-500">(link expires in 5 minutes)</span>
            </li>
          ))}
        </ul>
      )}
      {Object.keys(paths).length === 0 && def.fields.some((f) => f.type === "file") && sub.status !== "submitted" && (
        <p className="text-xs text-slate-500">Uploaded files have been deleted after the decision.</p>
      )}

      {sub.status === "submitted" ? (
        <DecisionForm id={sub.id} checklist={def.checklist} allowsExpiry={def.allowsExpiry === true} />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Decision: <strong>{sub.status}</strong>
          {sub.reviewed_at ? ` on ${new Date(sub.reviewed_at).toLocaleDateString("en-GB")}` : ""}
          {sub.review_note ? `. Note: ${sub.review_note}` : ""}
        </p>
      )}
    </div>
  );
}
