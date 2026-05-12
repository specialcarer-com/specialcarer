import Link from "next/link";
import Image from "next/image";

export type FavouriteRow = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  services: string[] | null;
  hourly_rate_cents: number | null;
  currency: "GBP" | "USD" | null;
  avatar_url: string | null;
  verified: boolean;
};

const VERTICAL_LABEL: Record<string, string> = {
  elderly_care: "Elderly",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex",
};

/**
 * Up to 6 saved caregivers. Seeker-only — caller should not render
 * this widget for caregivers.
 */
export default function FavouriteCaregiversWidget({
  rows,
}: {
  rows: FavouriteRow[];
}) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Favourite caregivers</h2>
        <Link
          href="/account/saved"
          className="text-sm text-brand hover:text-brand-700"
        >
          Manage saved →
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 p-6 rounded-2xl bg-white border border-dashed border-slate-200 text-center">
          <p className="text-slate-700">
            You haven&rsquo;t saved any caregivers yet.
          </p>
          <Link
            href="/find-care"
            className="inline-block mt-3 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
          >
            Find a caregiver
          </Link>
        </div>
      ) : (
        <ul
          className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3"
          aria-label="Saved caregivers"
        >
          {rows.slice(0, 6).map((c) => (
            <li key={c.user_id}>
              <Link
                href={`/caregivers/${c.user_id}`}
                className="block h-full p-3 rounded-2xl bg-white border border-slate-100 hover:border-brand-200 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand transition"
              >
                <div className="flex items-center gap-3">
                  {c.avatar_url ? (
                    <Image
                      src={c.avatar_url}
                      alt={`${c.display_name ?? "Caregiver"} profile picture`}
                      width={48}
                      height={48}
                      className="rounded-full object-cover w-12 h-12"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 font-semibold flex items-center justify-center"
                      aria-hidden
                    >
                      {(c.display_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate flex items-center gap-1.5">
                      {c.display_name ?? "Caregiver"}
                      {c.verified && (
                        <span
                          title="Verified — DBS + RTW cleared"
                          aria-label="Verified caregiver"
                          className="text-brand"
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    {c.city && (
                      <div className="text-xs text-slate-500 truncate">
                        {c.city}
                      </div>
                    )}
                  </div>
                </div>
                {c.services && c.services.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.services.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-medium text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded-full"
                      >
                        {VERTICAL_LABEL[s] ?? s}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 text-xs font-semibold text-brand hover:text-brand-700">
                  Book again →
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
