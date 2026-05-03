import Link from "next/link";
import { formatMoney, serviceLabel } from "@/lib/care/services";

export type CaregiverCardData = {
  user_id: string;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  city: string | null;
  region: string | null;
  country: "GB" | "US";
  services: string[];
  hourly_rate_cents: number | null;
  currency: "GBP" | "USD" | null;
  years_experience: number | null;
  languages: string[];
  rating_avg: number | null;
  rating_count: number;
  match_score?: number;
};

function initials(name: string | null) {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

export default function CaregiverCard({
  c,
  bookable = true,
}: {
  c: CaregiverCardData;
  bookable?: boolean;
}) {
  const country = c.country === "GB" ? "UK" : "US";
  const location = [c.city, country].filter(Boolean).join(", ");
  const rate =
    c.hourly_rate_cents != null && c.currency
      ? `${formatMoney(c.hourly_rate_cents, c.currency)}/hr`
      : "Rate on request";

  return (
    <article className="bg-white p-5 rounded-2xl border border-slate-100 hover:border-brand-100 hover:shadow-sm transition flex flex-col">
      <div className="flex items-start gap-4">
        <Link
          href={`/caregiver/${c.user_id}`}
          className="w-14 h-14 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-semibold text-lg flex-none hover:bg-brand-100 transition"
          aria-label={`View ${c.display_name ?? "caregiver"} profile`}
        >
          {initials(c.display_name)}
        </Link>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">
            <Link
              href={`/caregiver/${c.user_id}`}
              className="hover:text-brand-700 transition"
            >
              {c.display_name ?? "Caregiver"}
            </Link>
          </h3>
          {c.headline && (
            <p className="text-sm text-slate-600 truncate">{c.headline}</p>
          )}
          <div className="mt-1 text-xs text-slate-500">{location}</div>
        </div>
        <div className="text-right flex-none">
          <div className="font-semibold text-slate-900">{rate}</div>
          {typeof c.match_score === "number" && (
            <div className="text-xs text-brand-700 font-medium mt-1">
              {Math.round(c.match_score)}% match
            </div>
          )}
        </div>
      </div>

      {c.bio && (
        <p className="mt-4 text-sm text-slate-600 line-clamp-3">{c.bio}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {c.services.slice(0, 4).map((s) => (
          <span
            key={s}
            className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs"
          >
            {serviceLabel(s)}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600">
        <div>
          <div className="text-slate-500">Experience</div>
          <div className="font-medium text-slate-900">
            {c.years_experience != null ? `${c.years_experience} yrs` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Languages</div>
          <div className="font-medium text-slate-900 truncate">
            {c.languages.length > 0 ? c.languages.slice(0, 2).join(", ") : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Rating</div>
          <div className="font-medium text-slate-900">
            {c.rating_count > 0 && c.rating_avg != null
              ? `${c.rating_avg.toFixed(1)} (${c.rating_count})`
              : "New"}
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Link
          href={`/caregiver/${c.user_id}`}
          className="flex-1 text-center px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
        >
          View
        </Link>
        {bookable ? (
          <Link
            href={`/book/${c.user_id}`}
            className="flex-1 text-center px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
          >
            Book
          </Link>
        ) : (
          <Link
            href={`/login?redirectTo=/book/${c.user_id}`}
            className="flex-1 text-center px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
          >
            Sign in to book
          </Link>
        )}
      </div>
    </article>
  );
}
