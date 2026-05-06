import Link from "next/link";
import { listMembershipsAdmin } from "@/lib/memberships/server";
import type { MembershipStatus } from "@/lib/memberships/types";
import { PLAN_LABEL } from "@/lib/memberships/types";
import GrantForm from "./GrantForm";
import RevokeButton from "./RevokeButton";

export const dynamic = "force-dynamic";

const STATUSES: { key: MembershipStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "trialing", label: "Trialing" },
  { key: "comp", label: "Comp" },
  { key: "past_due", label: "Past due" },
  { key: "canceled", label: "Canceled" },
];

function fmtDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusPill(status: MembershipStatus) {
  const map: Record<MembershipStatus, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-green-50 text-green-700" },
    trialing: { label: "Trialing", cls: "bg-blue-50 text-blue-700" },
    past_due: { label: "Past due", cls: "bg-amber-50 text-amber-700" },
    canceled: { label: "Canceled", cls: "bg-slate-100 text-slate-600" },
    unpaid: { label: "Unpaid", cls: "bg-red-50 text-red-700" },
    incomplete: { label: "Incomplete", cls: "bg-slate-100 text-slate-600" },
    incomplete_expired: {
      label: "Expired",
      cls: "bg-slate-100 text-slate-600",
    },
    paused: { label: "Paused", cls: "bg-slate-100 text-slate-600" },
    comp: { label: "Comp", cls: "bg-amber-50 text-amber-700" },
  };
  const m = map[status];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

export default async function AdminMemberships({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = (sp.status as MembershipStatus | "all") || "all";

  const rows = await listMembershipsAdmin({
    status: statusFilter,
    limit: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Memberships</h1>
        <p className="text-sm text-slate-500 mt-1">
          Stripe-paid subscriptions and admin-granted comps. Use the grant
          form below to give a complimentary membership to a user; revoke
          comps with the Revoke button. Stripe-paid subscriptions can only be
          canceled in the Stripe dashboard \u2014 the webhook will sync the row.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {STATUSES.map((s) => {
          const active = statusFilter === s.key;
          const qs = s.key === "all" ? "" : `?status=${s.key}`;
          return (
            <Link
              key={s.key}
              href={`/admin/memberships${qs}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-brand text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <GrantForm />

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Plan</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-left px-3 py-2">Period end</th>
              <th className="text-left px-3 py-2">Reason</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  No memberships found for this filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-slate-900">
                      {r.user_name || "\u2014"}
                    </div>
                    <div className="text-xs text-slate-500 break-all">
                      {r.user_email || r.user_id}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">{PLAN_LABEL[r.plan]}</td>
                  <td className="px-3 py-2 align-top">{statusPill(r.status)}</td>
                  <td className="px-3 py-2 align-top capitalize">{r.source}</td>
                  <td className="px-3 py-2 align-top text-slate-600">
                    {fmtDate(r.current_period_end)}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-600 max-w-[16rem]">
                    {r.grant_reason ?? ""}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    {r.source === "comp" && r.status === "comp" ? (
                      <RevokeButton subscriptionId={r.id} />
                    ) : (
                      <span className="text-xs text-slate-400">
                        {r.source === "stripe"
                          ? "Manage in Stripe"
                          : "\u2014"}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
