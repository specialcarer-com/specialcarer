import Link from "next/link";
import type { CareTip } from "@/lib/care-tips/types";

const SEASONAL_ICON = (months: number[]): string => {
  if (months.length === 0) return "💡";
  const m = months[0];
  if ([12, 1, 2].includes(m)) return "❄";
  if ([3, 4, 5].includes(m)) return "🌱";
  if ([6, 7, 8].includes(m)) return "☀";
  if ([9, 10, 11].includes(m)) return "🍂";
  return "💡";
};

/**
 * Care-tips widget — surfaces 2 tips chosen by `selectTips()`. Pure
 * presentational; the parent server component does selection so the
 * picks are deterministic by user+week.
 */
export default function CareTipsWidget({ tips }: { tips: CareTip[] }) {
  if (tips.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Care tips for this week</h2>
        <Link
          href="/dashboard/care-tips"
          className="text-sm text-brand hover:text-brand-700"
        >
          More care tips →
        </Link>
      </div>
      <ul className="mt-4 grid sm:grid-cols-2 gap-3" aria-label="Care tips">
        {tips.map((t) => (
          <li
            key={t.id}
            className="p-4 rounded-2xl bg-white border border-slate-100"
          >
            <div className="flex items-start gap-3">
              <span
                className="w-9 h-9 rounded-full bg-accent/20 text-2xl flex items-center justify-center flex-none"
                aria-hidden
              >
                {SEASONAL_ICON(t.months)}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{t.title}</h3>
                <p className="mt-1 text-sm text-slate-700">{t.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
