import Link from "next/link";
import type { FeedEvent, FeedItem } from "@/lib/activity-feed/digest";
import { buildFeed } from "@/lib/activity-feed/digest";

const EVENT_LABEL: Record<string, (e: FeedEvent, role: "seeker" | "caregiver") => string> =
  {
    carer_checked_in: (_e, role) =>
      role === "seeker" ? "Caregiver checked in" : "You checked in",
    carer_checked_out: (e, role) => {
      const m = Number((e.event_data?.minutes as number | undefined) ?? 0);
      const dur =
        m > 0 ? ` · ${Math.round(m / 60)}h ${m % 60}m worked` : "";
      return role === "seeker"
        ? `Caregiver checked out${dur}`
        : `You checked out${dur}`;
    },
    shift_time_adjusted: (e) =>
      `Time adjustment lodged${
        e.event_data?.reason ? ` — ${String(e.event_data.reason)}` : ""
      }`,
    payment_settled: (_e, role) =>
      role === "seeker"
        ? "Booking closed — payment settled"
        : "Payout confirmed for your shift",
  };

const ICON: Record<string, string> = {
  carer_checked_in: "→",
  carer_checked_out: "✓",
  shift_time_adjusted: "⟳",
  payment_settled: "£",
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/**
 * Activity feed widget — last 5 events (or digests). Same component for
 * both roles; copy adapts via `role` prop.
 */
export default function ActivityFeedWidget({
  events,
  role,
}: {
  events: FeedEvent[];
  role: "seeker" | "caregiver";
}) {
  const items: FeedItem[] = buildFeed(events).slice(0, 5);

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">Activity</h2>
      {items.length === 0 ? (
        <div className="mt-4 p-6 rounded-2xl bg-white border border-dashed border-slate-200 text-center">
          <p className="text-slate-700">
            No recent activity yet — events will show here as bookings happen.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Recent activity">
          {items.map((it, idx) => {
            if (it.kind === "digest") {
              return (
                <li
                  key={`d-${idx}`}
                  className="p-3 rounded-xl bg-white border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-sm font-bold flex items-center justify-center flex-none"
                      aria-hidden
                    >
                      {it.count}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {it.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        {timeAgo(it.ts)}
                        {it.booking_id ? " · same booking" : ""}
                      </div>
                    </div>
                    {it.booking_id && (
                      <Link
                        href={`/dashboard/bookings/${it.booking_id}`}
                        className="ml-auto text-xs text-brand hover:text-brand-700 flex-none"
                      >
                        View →
                      </Link>
                    )}
                  </div>
                </li>
              );
            }
            const label =
              EVENT_LABEL[it.event_type]?.(it as FeedEvent, role) ??
              it.event_type;
            return (
              <li
                key={`e-${idx}`}
                className="p-3 rounded-xl bg-white border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-sm font-bold flex items-center justify-center flex-none"
                    aria-hidden
                  >
                    {ICON[it.event_type] ?? "•"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {timeAgo(it.ts)}
                    </div>
                  </div>
                  {it.booking_id && (
                    <Link
                      href={`/dashboard/bookings/${it.booking_id}`}
                      className="ml-auto text-xs text-brand hover:text-brand-700 flex-none"
                    >
                      View →
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
