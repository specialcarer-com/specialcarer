import Link from "next/link";
import { formatMoney, serviceLabel } from "@/lib/care/services";
import { certLabel } from "@/lib/care/attributes";
import SmartMatchPill from "@/components/SmartMatchPill";

export type CaregiverCardData = {
  user_id: string;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  city: string | null;
  region: string | null;
  country: "GB" | "US";
  services: string[];
  care_formats: string[];
  hourly_rate_cents: number | null;
  weekly_rate_cents: number | null;
  currency: "GBP" | "USD" | null;
  years_experience: number | null;
  languages: string[];
  rating_avg: number | null;
  rating_count: number;
  match_score?: number;
  /** Top-reason text from /api/ai/match (added in AI v1). When present
   *  alongside `match_score`, a SmartMatchPill is rendered. */
  match_reason?: string;
  // Booking preference filter attributes (optional, additive)
  gender?: string | null;
  has_drivers_license?: boolean;
  has_own_vehicle?: boolean;
  tags?: string[];
  certifications?: string[];
  // Geo search annotations (only present when search ran with `near`)
  distance_m?: number | null;
  hide_precise_location?: boolean;
};

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m away`;
  const km = m / 1000;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

function formatRate(c: CaregiverCardData): string {
  if (!c.currency) return "Rate on request";
  const offersVisiting = c.care_formats.includes("visiting");
  const offersLiveIn = c.care_formats.includes("live_in");
  const parts: string[] = [];
  if (offersVisiting && c.hourly_rate_cents != null) {
    parts.push(`${formatMoney(c.hourly_rate_cents, c.currency)}/hr`);
  }
  if (offersLiveIn && c.weekly_rate_cents != null) {
    parts.push(`${formatMoney(c.weekly_rate_cents, c.currency)}/wk`);
  }
  // Fallback for legacy/unset format data
  if (parts.length === 0 && c.hourly_rate_cents != null) {
    parts.push(`${formatMoney(c.hourly_rate_cents, c.currency)}/hr`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Rate on request";
}

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
  const rate = formatRate(c);

  return (
    <article className="min-w-0 bg-white p-5 rounded-2xl border border-slate-100 hover:border-brand-100 hover:shadow-sm transition flex flex-col">
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
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
            <span>{location}</span>
            {typeof c.distance_m === "number" && Number.isFinite(c.distance_m) && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-medium">
                {formatDistance(c.distance_m)}
              </span>
            )}
          </div>
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

      {/* AI v1 SmartMatchPill — additive. Renders when we have a top
          reason from /api/ai/match. Falls back to mock-mode if there's
          no score but a rating is available, so mock screens still get
          a believable visual. */}
      {typeof c.match_score === "number" && c.match_reason ? (
        <div className="mt-3">
          <SmartMatchPill
            score={c.match_score > 1 ? c.match_score / 100 : c.match_score}
            reason={c.match_reason}
          />
        </div>
      ) : typeof c.rating_avg === "number" && c.rating_avg > 0 && c.match_score == null ? (
        <div className="mt-3">
          <SmartMatchPill
            mode="mock"
            caregiver={{ rating_avg: c.rating_avg, rating_count: c.rating_count }}
          />
        </div>
      ) : null}

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

      {(c.has_drivers_license || c.has_own_vehicle || (c.certifications && c.certifications.length > 0) || (c.tags && c.tags.length > 0)) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.has_drivers_license && (
            <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-medium">
              Driver
            </span>
          )}
          {c.has_own_vehicle && (
            <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-medium">
              Has vehicle
            </span>
          )}
          {(c.certifications ?? []).slice(0, 3).map((k) => (
            <span
              key={k}
              className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium"
            >
              {certLabel(k)}
            </span>
          ))}
          {(c.tags ?? []).slice(0, 2).map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[11px]"
            >
              {t}
            </span>
          ))}
        </div>
      )}

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
