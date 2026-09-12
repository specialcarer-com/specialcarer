/**
 * Case detail — duty-of-candour + notifiable-event casework
 * (Phase C — PR C3b).
 *
 * Server component. Guard: `role='admin'` (extends when RM/NI roles
 * land — TODO(rm-ni-split): allow role='rm' | 'ni').
 *
 * Structure:
 *   1. Header (type + severity + state badges, subject, times, 2 SLAs).
 *   2. Details — read-only field summary.
 *   3. Timeline — audit trail from notifiable_event_actions.
 *   4. Actions — 4 inline forms (disclosure, regulator, note, close)
 *                each POSTing to a route handler.
 *   5. Attachments — upload form + timeline entries.
 *   6. Regulator template — CQC template with copy-to-clipboard;
 *      placeholder devolved-nation regulators shown greyed out.
 *
 * All forms use plain HTML `method=post` to route handlers — no
 * client-side state. The single client component is
 * <CopyToClipboardButton />.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import SlaBadge from "@/components/candour/SlaBadge";
import CopyToClipboardButton from "@/components/candour/CopyToClipboardButton";
import {
  CQC_TEMPLATES,
  PLACEHOLDER_REGULATORS,
} from "@/lib/candour/regulator-templates";
import type {
  NotifiableType,
  Severity,
  CaseState,
} from "@/lib/candour/case";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  type: NotifiableType;
  severity: Severity;
  state: CaseState;
  reported_by: string;
  subject_person_id: string | null;
  subject_description: string | null;
  booking_id: string | null;
  carer_id: string | null;
  occurred_at: string | null;
  discovered_at: string;
  regulator_notify_target_at: string | null;
  candour_disclosure_target_at: string | null;
  regulator_notified_at: string | null;
  regulator_reference: string | null;
  disclosure_completed_at: string | null;
  closure_reason: string | null;
  ni_signoff_by: string | null;
  ni_signoff_at: string | null;
  created_at: string;
};

type ActionRow = {
  id: string;
  event_id: string;
  acted_by: string;
  action: string;
  previous_state: string | null;
  new_state: string | null;
  notes: string | null;
  attachment_path: string | null;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSchemaMissing(err: any): boolean {
  const code = err?.code as string | undefined;
  return code === "42P01" || code === "42703";
}

function formatLondon(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

async function signedUrlFor(path: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage
      .from("notifiable-events")
      .createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export default async function CandourCasePage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: eventData, error: eventErr } = await admin
    .from("notifiable_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (eventErr) {
    if (isSchemaMissing(eventErr)) {
      notFound();
    }
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        Failed to load: {eventErr.message}
      </div>
    );
  }
  if (!eventData) notFound();
  const event = eventData as EventRow;

  const { data: actionsData } = await admin
    .from("notifiable_event_actions")
    .select("*")
    .eq("event_id", id)
    .order("created_at", { ascending: true });
  const actions = (actionsData ?? []) as ActionRow[];

  // Best-effort profile enrichment for reporter, subject, action actors.
  const profileIds = Array.from(
    new Set(
      [
        event.reported_by,
        event.subject_person_id,
        event.carer_id,
        event.ni_signoff_by,
        ...actions.map((a) => a.acted_by),
      ].filter((v): v is string => !!v),
    ),
  );
  let profileMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    if (Array.isArray(profs)) {
      profileMap = new Map(
        profs.map((p: { id: string; full_name: string | null }) => [
          p.id,
          p.full_name ?? "(unnamed)",
        ]),
      );
    }
  }
  const nameOf = (uid: string | null): string =>
    (uid && profileMap.get(uid)) ?? (uid ? uid.slice(0, 8) : "—");

  // NI sign-off options — today the pool is `role='admin'`. When the
  // NI role is introduced this list flips to `role='ni'`.
  // TODO(rm-ni-split): filter to role='ni' when introduced.
  const { data: niCandidatesData } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "admin")
    .limit(50);
  const niCandidates = (niCandidatesData ?? []) as Array<{
    id: string;
    full_name: string | null;
  }>;

  const subjectLabel = event.subject_person_id
    ? nameOf(event.subject_person_id)
    : (event.subject_description ?? "(unspecified)");

  const template = CQC_TEMPLATES[event.type];

  // Resolve signed URLs for any attachments (5-min TTL). Best-effort;
  // if the bucket isn't yet created they simply won't render as links.
  const attachmentLinks = new Map<string, string | null>();
  for (const a of actions) {
    if (a.attachment_path) {
      attachmentLinks.set(
        a.attachment_path,
        await signedUrlFor(a.attachment_path),
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/safeguarding/candour"
          className="text-xs text-slate-500 hover:underline"
        >
          ← Back to queue
        </Link>
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {event.type}
          </span>
          <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {event.severity}
          </span>
          <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {event.state}
          </span>
          <span className="ml-auto text-xs text-slate-500">
            Case #{event.id.slice(0, 8)}
          </span>
        </div>
        <p className="mt-3 text-sm font-medium text-slate-900">
          Subject: <span className="font-normal">{subjectLabel}</span>
        </p>
        <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <div>
            <span className="font-medium text-slate-500">Discovered</span>
            <div>{formatLondon(event.discovered_at)}</div>
          </div>
          <div>
            <span className="font-medium text-slate-500">Occurred</span>
            <div>{formatLondon(event.occurred_at)}</div>
          </div>
          <div>
            <span className="font-medium text-slate-500">Reporter</span>
            <div>{nameOf(event.reported_by)}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <SlaBadge
            target_at={
              event.regulator_notify_target_at
                ? new Date(event.regulator_notify_target_at)
                : null
            }
            label="Regulator notify"
          />
          <SlaBadge
            target_at={
              event.candour_disclosure_target_at
                ? new Date(event.candour_disclosure_target_at)
                : null
            }
            label="Candour disclosure"
          />
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          {event.regulator_notify_target_at && (
            <span className="mr-4">
              Regulator target:{" "}
              {formatLondon(event.regulator_notify_target_at)}
            </span>
          )}
          {event.candour_disclosure_target_at && (
            <span>
              Disclosure target:{" "}
              {formatLondon(event.candour_disclosure_target_at)}
            </span>
          )}
        </div>
      </header>

      {/* Details */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
        <dl className="mt-3 grid gap-3 text-xs text-slate-700 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-500">Booking</dt>
            <dd>{event.booking_id ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Carer</dt>
            <dd>{nameOf(event.carer_id)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">CQC reference</dt>
            <dd>{event.regulator_reference ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">
              Regulator notified at
            </dt>
            <dd>{formatLondon(event.regulator_notified_at)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">
              Disclosure completed at
            </dt>
            <dd>{formatLondon(event.disclosure_completed_at)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">NI sign-off</dt>
            <dd>
              {event.ni_signoff_by
                ? `${nameOf(event.ni_signoff_by)} @ ${formatLondon(event.ni_signoff_at)}`
                : "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-slate-500">Closure reason</dt>
            <dd>{event.closure_reason ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Timeline */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
        {actions.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            No timeline entries yet.
          </p>
        ) : (
          <ol className="mt-3 space-y-3 text-xs">
            {actions.map((a) => {
              const signed = a.attachment_path
                ? attachmentLinks.get(a.attachment_path)
                : null;
              return (
                <li
                  key={a.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-slate-800">
                      {a.action}
                    </span>
                    {a.previous_state && a.new_state && a.previous_state !== a.new_state && (
                      <span className="text-slate-500">
                        {a.previous_state} → {a.new_state}
                      </span>
                    )}
                    <span className="ml-auto text-slate-500">
                      {formatLondon(a.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-600">
                    by {nameOf(a.acted_by)}
                  </div>
                  {a.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">
                      {a.notes}
                    </p>
                  )}
                  {a.attachment_path && (
                    <div className="mt-1">
                      {signed ? (
                        <a
                          href={signed}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          {a.attachment_path}
                        </a>
                      ) : (
                        <span className="text-slate-500">
                          {a.attachment_path}{" "}
                          <span className="text-[10px] text-slate-400">
                            (signed URL unavailable)
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Actions */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
        <div className="mt-3 space-y-4">
          {/* Record disclosure step */}
          {(event.state === "open" ||
            event.state === "disclosure_in_progress") && (
            <form
              method="post"
              action={`/api/candour/${event.id}/disclosure`}
              className="rounded-lg border border-slate-200 p-3"
              encType="application/json"
            >
              <label className="block text-xs font-semibold text-slate-700">
                Record disclosure step
                <span className="ml-2 font-normal text-slate-500">
                  (advances to{" "}
                  {event.state === "open"
                    ? "disclosure_in_progress"
                    : "disclosure_complete"}
                  )
                </span>
              </label>
              <textarea
                name="notes"
                required
                minLength={20}
                rows={3}
                className="mt-2 w-full rounded-md border border-slate-300 p-2 text-xs"
                placeholder="Notes on what was disclosed and to whom (min 20 chars)"
              />
              <button
                type="submit"
                className="mt-2 rounded-md bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-800"
              >
                Record
              </button>
            </form>
          )}

          {/* Mark regulator notified */}
          {(event.state === "open" ||
            event.state === "disclosure_in_progress" ||
            event.state === "disclosure_complete") && (
            <form
              method="post"
              action={`/api/candour/${event.id}/regulator-notified`}
              className="rounded-lg border border-slate-200 p-3"
              encType="application/json"
            >
              <label className="block text-xs font-semibold text-slate-700">
                Mark regulator notified
              </label>
              <input
                name="regulator_reference"
                required
                type="text"
                className="mt-2 w-full rounded-md border border-slate-300 p-2 text-xs"
                placeholder="CQC reference number (required)"
              />
              <textarea
                name="notes"
                rows={2}
                className="mt-2 w-full rounded-md border border-slate-300 p-2 text-xs"
                placeholder="Optional notes"
              />
              <button
                type="submit"
                className="mt-2 rounded-md bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-800"
              >
                Mark notified
              </button>
            </form>
          )}

          {/* Add note */}
          <form
            method="post"
            action={`/api/candour/${event.id}/note`}
            className="rounded-lg border border-slate-200 p-3"
            encType="application/json"
          >
            <label className="block text-xs font-semibold text-slate-700">
              Add note
            </label>
            <textarea
              name="notes"
              required
              minLength={5}
              rows={2}
              className="mt-2 w-full rounded-md border border-slate-300 p-2 text-xs"
              placeholder="Note (min 5 chars) — appended to the audit trail"
            />
            <button
              type="submit"
              className="mt-2 rounded-md bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-800"
            >
              Add
            </button>
          </form>

          {/* Close case */}
          {event.state === "notified_regulator" && (
            <form
              method="post"
              action={`/api/candour/${event.id}/close`}
              className="rounded-lg border border-slate-200 p-3"
              encType="application/json"
            >
              <label className="block text-xs font-semibold text-slate-700">
                Close case
              </label>
              <textarea
                name="closure_reason"
                required
                minLength={30}
                rows={3}
                className="mt-2 w-full rounded-md border border-slate-300 p-2 text-xs"
                placeholder="Closure reason (min 30 chars) — visible on the audit record"
              />
              <label className="mt-2 block text-[11px] text-slate-600">
                NI sign-off{" "}
                <span className="text-slate-400">
                  {/* TODO(rm-ni-split): filter to role='ni' when introduced */}
                </span>
              </label>
              <select
                name="ni_signoff_by"
                required
                defaultValue=""
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
              >
                <option value="" disabled>
                  Select an NI signatory
                </option>
                {niCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name ?? c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="mt-3 rounded-md bg-red-700 px-3 py-1 text-xs text-white hover:bg-red-800"
              >
                Close case
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Attachments */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Attachments</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          PDF, JPEG, PNG, DOCX, or TXT. Max 10 MB. Stored in the private
          `notifiable-events` bucket.
        </p>
        <form
          method="post"
          action={`/api/candour/${event.id}/attachment`}
          encType="multipart/form-data"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.docx,.txt"
            className="text-xs"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-800"
          >
            Upload
          </button>
        </form>
      </section>

      {/* Regulator template */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          CQC notification template
        </h2>
        <p className="mt-1 text-[11px] text-slate-500">
          {template.statutoryClause} Copy-paste into the CQC Provider
          Portal — this template is not auto-submitted anywhere.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <CopyToClipboardButton
            text={template.body}
            label={`Copy ${template.title}`}
          />
        </div>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-800">
          {template.body}
        </pre>

        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Other regulators
          </h3>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
            {Object.entries(PLACEHOLDER_REGULATORS).map(([k, r]) => (
              <li
                key={k}
                className="rounded-md border border-dashed border-slate-200 bg-slate-50/50 p-2"
              >
                <span className="font-medium text-slate-500">
                  {r.name}
                </span>{" "}
                — {r.jurisdiction}
                <div className="mt-0.5 italic">{r.note}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
