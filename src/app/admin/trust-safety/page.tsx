import Link from "next/link";
import { getTrustSafetyCounts } from "@/lib/admin/trust-safety";

export const dynamic = "force-dynamic";

export default async function TrustSafetyHub() {
  const c = await getTrustSafetyCounts();

  const cards = [
    {
      href: "/admin/trust-safety/reviews",
      title: "Reviews",
      blurb:
        "Moderate user-submitted reviews. Hide profanity, off-topic, or fake content. Low-rating reviews are flagged for triage.",
      counter: `${c.reviewsLowRating} low-rating`,
      tone: c.reviewsLowRating > 0 ? "warn" : "default",
    },
    {
      href: "/admin/trust-safety/disputes",
      title: "Disputes",
      blurb:
        "Bookings flagged as disputed. Triage the timeline, contact both parties, and decide on refund vs release.",
      counter: `${c.disputes} open`,
      tone: c.disputes > 0 ? "danger" : "default",
    },
    {
      href: "/admin/trust-safety/kyc",
      title: "KYC escalations",
      blurb:
        "Background-check results in consider / failed state. Approve, reject, or request more information.",
      counter: `${c.kycEscalations} flagged`,
      tone: c.kycEscalations > 0 ? "warn" : "default",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Trust &amp; safety</h1>
        <p className="text-sm text-slate-500 mt-1">
          Three queues: review moderation, booking disputes, and background-check
          escalations. All decisions are recorded in the audit log.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => {
          const toneCls =
            c.tone === "danger"
              ? "border-rose-200 bg-rose-50"
              : c.tone === "warn"
                ? "border-amber-200 bg-amber-50"
                : "border-slate-200 bg-white";
          return (
            <Link
              key={c.href}
              href={c.href}
              className={`rounded-2xl border ${toneCls} p-5 hover:shadow-sm transition-shadow`}
            >
              <div className="flex items-start justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  {c.title}
                </h2>
                <span className="text-xs font-medium text-slate-700">
                  {c.counter}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                {c.blurb}
              </p>
              <span className="mt-3 inline-block text-xs font-medium text-brand-700">
                Open queue →
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
