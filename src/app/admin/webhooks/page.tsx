import Link from "next/link";
import {
  listWebhookEvents,
  type WebhooksFilter,
  type WebhookVendor,
} from "@/lib/admin/webhooks";
import ResetButton from "./_components/ResetButton";

export const dynamic = "force-dynamic";

const VENDORS: { key: WebhookVendor | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "stripe", label: "Stripe" },
  { key: "uchecks", label: "uCheck" },
  { key: "checkr", label: "Checkr" },
];

const STATES: { key: NonNullable<WebhooksFilter["state"]>; label: string }[] = [
  { key: "all", label: "Any state" },
  { key: "processed", label: "Processed" },
  { key: "errored", label: "Errored" },
  { key: "unprocessed", label: "Unprocessed" },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildQs(
  filter: WebhooksFilter,
  overrides: Partial<WebhooksFilter & { page: number }>,
) {
  const merged = { ...filter, ...overrides };
  const params = new URLSearchParams();
  if (merged.vendor && merged.vendor !== "all")
    params.set("vendor", merged.vendor);
  if (merged.state && merged.state !== "all") params.set("state", merged.state);
  if (merged.q) params.set("q", merged.q);
  if ("page" in overrides && overrides.page && overrides.page > 1)
    params.set("page", String(overrides.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

function stateChip(processedAt: string | null, error: string | null) {
  if (error) {
    return (
      <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md bg-rose-50 text-rose-700">
        Errored
      </span>
    );
  }
  if (processedAt) {
    return (
      <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
        Processed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
      Pending
    </span>
  );
}

export default async function AdminWebhooks({
  searchParams,
}: {
  searchParams: Promise<{
    vendor?: string;
    state?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const filter: WebhooksFilter = {
    vendor: (sp.vendor as WebhookVendor | "all") || "all",
    state: (sp.state as WebhooksFilter["state"]) || "all",
    q: sp.q || undefined,
  };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { rows, total, totalPages } = await listWebhookEvents(filter, page);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Webhooks</h1>
        <p className="text-sm text-slate-500 mt-1">
          Inbound webhook events from Stripe, uCheck, and Checkr. All events
          are recorded; failed handlers can be reset for redelivery.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {VENDORS.map((v) => {
          const active = filter.vendor === v.key;
          return (
            <Link
              key={v.key}
              href={`/admin/webhooks${buildQs(filter, { vendor: v.key, page: 1 })}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-brand text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      <form
        method="get"
        action="/admin/webhooks"
        className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-2xl p-4"
      >
        <input type="hidden" name="vendor" value={filter.vendor ?? "all"} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">State</label>
          <select
            name="state"
            defaultValue={filter.state ?? "all"}
            className="text-sm border border-slate-300 rounded-md px-2 py-1"
          >
            {STATES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-slate-500 mb-1">
            Search (event id or type)
          </label>
          <input
            type="text"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="payment_intent.succeeded"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1"
          />
        </div>
        <button
          type="submit"
          className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
        >
          Apply
        </button>
        {(filter.state !== "all" || filter.q) && (
          <Link
            href={`/admin/webhooks${buildQs({ vendor: filter.vendor }, { page: 1 })}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No webhook events match these filters.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Vendor</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Received</th>
                <th className="text-left px-4 py-3 font-medium">State</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.vendor}-${r.event_id}`} className="align-top">
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-slate-700 uppercase tracking-wider">
                      {r.vendor}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                      {r.event_type}
                    </code>
                    <div className="font-mono text-[10px] text-slate-400 mt-1 break-all">
                      {r.event_id}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {fmtDateTime(r.received_at)}
                  </td>
                  <td className="px-4 py-3">
                    {stateChip(r.processed_at, r.error)}
                    {r.error && (
                      <details className="mt-1.5 text-[11px]">
                        <summary className="cursor-pointer text-rose-600 hover:text-rose-800">
                          View error
                        </summary>
                        <pre className="mt-1 p-2 bg-rose-50 border border-rose-100 rounded overflow-x-auto whitespace-pre-wrap max-w-md">
                          {r.error}
                        </pre>
                      </details>
                    )}
                    <details className="mt-1.5 text-[11px]">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                        View payload
                      </summary>
                      <pre className="mt-1 p-2 bg-slate-50 border border-slate-100 rounded overflow-x-auto whitespace-pre-wrap max-w-md max-h-64">
                        {JSON.stringify(r.payload, null, 2)}
                      </pre>
                    </details>
                  </td>
                  <td className="px-4 py-3">
                    <ResetButton vendor={r.vendor} eventId={r.event_id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Page {page} of {totalPages} · {total} total
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/webhooks${buildQs(filter, { page: page - 1 })}`}
              className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
            >
              ← Newer
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/webhooks${buildQs(filter, { page: page + 1 })}`}
              className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
            >
              Older →
            </Link>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Reset only clears our local processed-state for the event so that the
        vendor&apos;s next redelivery runs through the handler. Trigger the actual
        redelivery from the Stripe / uCheck / Checkr dashboard.
      </p>
    </div>
  );
}
