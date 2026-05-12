import Link from "next/link";

export type UpcomingBookingRow = {
  id: string;
  starts_at: string;
  status: string;
  hours: number | null;
  location_city: string | null;
  service_type: string | null;
  total_cents: number | null;
  currency: string | null;
  counterpartyName: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Awaiting payment",
  paid: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  accepted: "bg-amber-50 text-amber-800",
  paid: "bg-brand-50 text-brand-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
};

const VERTICAL_LABEL: Record<string, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
};

function fmtMoney(cents: number | null, currency: string | null) {
  if (cents == null) return "";
  const sym = (currency ?? "gbp").toLowerCase() === "usd" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

/**
 * Upcoming bookings widget — next 3 confirmed/in-progress shifts for the
 * caller. Same layout for both roles, only the labels change.
 */
export default function UpcomingBookingsWidget({
  rows,
  role,
}: {
  rows: UpcomingBookingRow[];
  role: "seeker" | "caregiver";
}) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Upcoming bookings</h2>
        <Link
          href="/dashboard/bookings"
          className="text-sm text-brand hover:text-brand-700"
        >
          See all →
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState role={role} />
      ) : (
        <ul className="mt-4 space-y-3" aria-label="Upcoming bookings">
          {rows.slice(0, 3).map((b) => (
            <li key={b.id}>
              <Link
                href={`/dashboard/bookings/${b.id}`}
                className="block p-4 rounded-2xl bg-white border border-slate-100 hover:border-brand-200 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {b.counterpartyName ??
                        (role === "caregiver" ? "Family" : "Caregiver")}
                    </div>
                    <div className="text-sm text-slate-600">
                      {new Date(b.starts_at).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {b.hours != null && ` · ${b.hours}h`}
                      {b.location_city && ` · ${b.location_city}`}
                    </div>
                    {b.service_type && (
                      <div className="mt-1 inline-block text-[11px] font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                        {VERTICAL_LABEL[b.service_type] ?? b.service_type}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        STATUS_TONE[b.status] ?? "bg-slate-100"
                      }`}
                    >
                      {STATUS_LABEL[b.status] ?? b.status}
                    </span>
                    {b.total_cents != null && (
                      <span className="font-semibold text-slate-900">
                        {fmtMoney(b.total_cents, b.currency)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState({ role }: { role: "seeker" | "caregiver" }) {
  if (role === "caregiver") {
    return (
      <div className="mt-4 p-6 rounded-2xl bg-white border border-dashed border-slate-200 text-center">
        <p className="text-slate-700">No upcoming shifts.</p>
        <Link
          href="/dashboard/bookings"
          className="inline-block mt-3 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
        >
          Browse open shifts
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-4 p-6 rounded-2xl bg-white border border-dashed border-slate-200 text-center">
      <p className="text-slate-700">No upcoming bookings yet.</p>
      <Link
        href="/find-care"
        className="inline-block mt-3 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
      >
        Book your first carer
      </Link>
    </div>
  );
}
