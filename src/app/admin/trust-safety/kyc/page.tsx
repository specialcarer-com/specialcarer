import Link from "next/link";
import { listKycEscalations, type KycFilter } from "@/lib/admin/trust-safety";
import KycDecide from "./_components/KycDecide";

export const dynamic = "force-dynamic";

const TABS: { key: KycFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "decided", label: "Decided" },
  { key: "all", label: "All" },
];

function fmtDateTime(iso: string | null) {
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
  const tone =
    status === "failed"
      ? "bg-rose-100 text-rose-800 border-rose-200"
      : status === "consider"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {status}
    </span>
  );
}

function decisionBadge(decision: string | null) {
  if (!decision)
    return (
      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold uppercase tracking-wider">
        Open
      </span>
    );
  const tone =
    decision === "approved"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : decision === "rejected"
        ? "bg-rose-100 text-rose-800 border-rose-200"
        : "bg-amber-100 text-amber-800 border-amber-200";
  return (
    <span
      className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {decision.replace(/_/g, " ")}
    </span>
  );
}

export default async function KycEscalationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter: KycFilter =
    sp.filter === "all" || sp.filter === "decided" || sp.filter === "open"
      ? sp.filter
      : "open";

  const rows = await listKycEscalations(filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            KYC escalations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Background checks in <code>consider</code> or <code>failed</code>{" "}
            state. Approve to clear the user; reject to block; request more
            info to await documents.
          </p>
        </div>
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; safety
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = filter === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/trust-safety/kyc?filter=${t.key}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-brand text-brand-700 font-medium"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No checks match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge(r.status)}
                    {decisionBadge(r.decision)}
                    <span className="text-xs text-slate-500 font-mono">
                      {r.vendor}/{r.check_type}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-800">
                    <Link
                      href={`/admin/users/${r.user_id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {r.user_name ?? r.user_id.slice(0, 8)}
                    </Link>
                    {r.user_email && (
                      <span className="text-slate-500"> · {r.user_email}</span>
                    )}
                  </div>
                  {r.result_summary && (
                    <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                      {r.result_summary}
                    </p>
                  )}
                  <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-3">
                    <span>Issued: {fmtDateTime(r.issued_at)}</span>
                    <span>Expires: {fmtDateTime(r.expires_at)}</span>
                    {r.vendor_check_id && (
                      <span className="font-mono">
                        Vendor ID: {r.vendor_check_id.slice(0, 16)}…
                      </span>
                    )}
                  </div>
                  {r.decision && (
                    <div className="mt-2 text-xs text-slate-600 border-l-2 border-slate-200 pl-2">
                      <div>
                        Decided by{" "}
                        <span className="font-medium">
                          {r.decided_by_email ?? "unknown"}
                        </span>{" "}
                        at {fmtDateTime(r.decided_at)}
                      </div>
                      {r.decision_notes && (
                        <div className="italic mt-0.5">
                          {r.decision_notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  <KycDecide
                    backgroundCheckId={r.id}
                    alreadyDecided={r.decision !== null}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
