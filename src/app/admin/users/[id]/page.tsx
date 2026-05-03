import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/admin/auth";
import {
  fmtMoney,
  fmtDateTime,
  statusTone,
  type BookingStatus,
} from "@/lib/admin/bookings";
import RoleChange from "./_components/RoleChange";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const BG_TONE: Record<string, string> = {
  cleared: "bg-emerald-50 text-emerald-700",
  consider: "bg-amber-50 text-amber-700",
  failed: "bg-rose-50 text-rose-700",
  expired: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
  invited: "bg-blue-50 text-blue-700",
  in_progress: "bg-blue-50 text-blue-700",
  submitted: "bg-blue-50 text-blue-700",
  pending_result: "bg-amber-50 text-amber-700",
};

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireAdmin();
  const { id } = await params;
  const data = await getUserDetail(id);
  if (!data) notFound();

  const { user, caregiverProfile, stripeAccount, backgroundChecks, bookings } =
    data;

  const isSelf = user.id === me.id;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          ← All users
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {user.full_name ?? "(no name)"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {user.email ?? user.id}
              {isSelf && (
                <span className="ml-2 inline-block text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  This is you
                </span>
              )}
            </p>
          </div>
          {user.role && (
            <span
              className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md ${
                user.role === "admin"
                  ? "bg-amber-50 text-amber-700"
                  : user.role === "caregiver"
                    ? "bg-violet-50 text-violet-700"
                    : "bg-blue-50 text-blue-700"
              }`}
            >
              {user.role}
            </span>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Account
          </h2>
          <dl className="space-y-2 text-sm">
            <Row k="User ID" v={user.id} mono />
            <Row k="Email" v={user.email ?? "—"} />
            <Row
              k="Email verified"
              v={user.email_confirmed_at ? "Yes" : "No"}
            />
            <Row k="Created" v={fmtDate(user.created_at)} />
            <Row
              k="Last sign-in"
              v={fmtDate(user.last_sign_in_at)}
            />
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Profile
          </h2>
          <dl className="space-y-2 text-sm">
            <Row k="Name" v={user.full_name ?? "—"} />
            <Row k="Country" v={user.country ?? "—"} />
            <Row k="Phone" v={user.phone ?? "—"} />
            <Row k="Role" v={user.role ?? "—"} />
          </dl>
        </div>
      </div>

      {caregiverProfile && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-wider text-slate-500">
              Caregiver profile
            </h2>
            <Link
              href={`/caregiver/${user.id}`}
              target="_blank"
              className="text-xs text-brand-700 hover:underline"
            >
              View public profile ↗
            </Link>
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row k="Display name" v={caregiverProfile.display_name ?? "—"} />
            <Row
              k="Status"
              v={caregiverProfile.is_published ? "Published" : "Hidden"}
            />
            <Row
              k="Location"
              v={`${caregiverProfile.city ?? "—"} · ${caregiverProfile.country ?? "—"}`}
            />
            <Row
              k="Hourly rate"
              v={
                caregiverProfile.hourly_rate_cents != null
                  ? fmtMoney(
                      caregiverProfile.hourly_rate_cents,
                      (caregiverProfile.currency?.toLowerCase() as
                        | "gbp"
                        | "usd") ?? "gbp",
                    )
                  : "—"
              }
            />
            <Row
              k="Rating"
              v={
                caregiverProfile.rating_count > 0
                  ? `${caregiverProfile.rating_avg?.toFixed(1)}★ (${caregiverProfile.rating_count})`
                  : "No reviews"
              }
            />
            <Row k="Headline" v={caregiverProfile.headline ?? "—"} />
          </dl>
        </div>
      )}

      {stripeAccount && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Stripe Connect
          </h2>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row k="Account ID" v={stripeAccount.stripe_account_id} mono />
            <Row
              k="Charges enabled"
              v={stripeAccount.charges_enabled ? "Yes" : "No"}
            />
            <Row
              k="Payouts enabled"
              v={stripeAccount.payouts_enabled ? "Yes" : "No"}
            />
            <Row
              k="Details submitted"
              v={stripeAccount.details_submitted ? "Yes" : "No"}
            />
          </dl>
          {stripeAccount.requirements_currently_due.length > 0 && (
            <div className="mt-3 text-xs text-amber-700">
              Outstanding: {stripeAccount.requirements_currently_due.join(", ")}
            </div>
          )}
        </div>
      )}

      {backgroundChecks.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Background checks
          </h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-1.5 font-medium">Check</th>
                <th className="text-left py-1.5 font-medium">Status</th>
                <th className="text-left py-1.5 font-medium">Issued</th>
                <th className="text-left py-1.5 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {backgroundChecks.map((b, i) => (
                <tr key={i}>
                  <td className="py-2 text-slate-700">{b.check_type}</td>
                  <td className="py-2">
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md ${
                        BG_TONE[b.status] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-slate-600">
                    {fmtDate(b.issued_at)}
                  </td>
                  <td className="py-2 text-xs text-slate-600">
                    {fmtDate(b.expires_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bookings.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Recent bookings ({bookings.length})
          </h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-1.5 font-medium">Booking</th>
                <th className="text-left py-1.5 font-medium">As</th>
                <th className="text-left py-1.5 font-medium">Counterparty</th>
                <th className="text-left py-1.5 font-medium">When</th>
                <th className="text-left py-1.5 font-medium">Total</th>
                <th className="text-left py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b) => {
                const tone = statusTone(b.status as BookingStatus);
                return (
                  <tr key={b.id}>
                    <td className="py-2">
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className="font-mono text-xs text-brand-700 hover:underline"
                      >
                        {b.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="py-2 text-xs text-slate-600">{b.role}</td>
                    <td className="py-2 text-slate-700">
                      {b.counterpartyName ?? "—"}
                    </td>
                    <td className="py-2 text-xs text-slate-600">
                      {fmtDateTime(b.starts_at)}
                    </td>
                    <td className="py-2 text-slate-900">
                      {fmtMoney(
                        b.total_cents,
                        b.currency.toLowerCase() as "gbp" | "usd",
                      )}
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md ${tone.cls}`}
                      >
                        {tone.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          Admin actions
        </h2>
        <RoleChange
          userId={user.id}
          currentRole={user.role}
          isSelf={isSelf}
        />
        <p className="text-xs text-slate-400">
          Role changes require a reason and are recorded in the audit log.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd
        className={`text-slate-900 text-right ${
          mono ? "font-mono text-xs break-all" : ""
        }`}
      >
        {v}
      </dd>
    </div>
  );
}
