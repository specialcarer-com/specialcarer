"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ServiceType =
  | "elderly_care"
  | "childcare"
  | "special_needs"
  | "postnatal"
  | "complex_care";

const SERVICES: { value: ServiceType; label: string }[] = [
  { value: "elderly_care", label: "Elderly care" },
  { value: "childcare", label: "Childcare" },
  { value: "special_needs", label: "Special-needs" },
  { value: "postnatal", label: "Postnatal & newborn" },
  { value: "complex_care", label: "Complex care" },
];

const START_OPTIONS = [
  { value: 15, label: "In 15 min" },
  { value: 60, label: "In 1 hr" },
  { value: 120, label: "In 2 hr" },
  { value: 240, label: "In 4 hr" },
  { value: 1440, label: "Today" },
];

const DURATION_OPTIONS = [
  { value: 1, label: "1 hr" },
  { value: 2, label: "2 hr" },
  { value: 4, label: "4 hr" },
  { value: 6, label: "6 hr" },
  { value: 8, label: "8 hr" },
];

type Match = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  photo_url: string | null;
  rating_avg: number | null;
  hourly_rate_cents: number | null;
  currency: string | null;
  distance_m: number;
  distance_km: number;
  min_notice_minutes: number;
  eta_minutes_estimate: number;
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTimeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function InstantBookClient() {
  const router = useRouter();
  const [postcode, setPostcode] = useState("");
  const [service, setService] = useState<ServiceType>("elderly_care");
  const [startInMinutes, setStartInMinutes] = useState<number>(60);
  const [durationHours, setDurationHours] = useState<number>(2);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [origin, setOrigin] = useState<{
    postcode: string;
    country: "GB" | "US";
  } | null>(null);

  function makeTimes() {
    const start = new Date(Date.now() + startInMinutes * 60_000);
    const end = new Date(start.getTime() + durationHours * 60 * 60_000);
    return { start, end };
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMatches(null);
    if (!postcode.trim()) {
      setErr("Please enter a postcode.");
      return;
    }
    setLoading(true);
    try {
      const { start, end } = makeTimes();
      const res = await fetch("/api/instant-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: postcode.trim(),
          service_type: service,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          max_results: 5,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        matches?: Match[];
        origin?: { postcode: string; country: "GB" | "US" };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "No match found");
      setMatches(json.matches ?? []);
      setOrigin(json.origin ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function bookMatch(m: Match) {
    const { start, end } = makeTimes();
    const params = new URLSearchParams({
      service,
      date: localDateStr(start),
      start: localTimeStr(start),
      end: localTimeStr(end),
      postcode: origin?.postcode ?? postcode.trim(),
      instant: "1",
    });
    router.push(`/book/${m.user_id}?${params.toString()}`);
  }

  return (
    <form onSubmit={search} className="space-y-5">
      <div className="p-6 rounded-2xl bg-white border border-slate-100 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Where do you need care?
          </label>
          <input
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            placeholder="e.g. SW1A 1AA or 10001"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100"
            autoComplete="postal-code"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            UK postcode or US ZIP. We&rsquo;ll only show the area to the carer
            until you confirm.
          </p>
        </div>

        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">
            What kind of care?
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {SERVICES.map((s) => {
              const on = service === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setService(s.value)}
                  className={`text-left p-3 rounded-xl border transition ${
                    on
                      ? "bg-brand-50 border-brand-200 text-brand-700"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              Start when?
            </div>
            <div className="flex flex-wrap gap-2">
              {START_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStartInMinutes(o.value)}
                  className={`px-3 py-1.5 rounded-xl border text-sm transition ${
                    startInMinutes === o.value
                      ? "bg-brand-50 border-brand-200 text-brand-700"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              For how long?
            </div>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setDurationHours(o.value)}
                  className={`px-3 py-1.5 rounded-xl border text-sm transition ${
                    durationHours === o.value
                      ? "bg-brand-50 border-brand-200 text-brand-700"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {err && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">
            {err}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
        >
          {loading ? "Finding nearest carer…" : "Find a carer now"}
        </button>
      </div>

      {matches && matches.length === 0 && (
        <div className="p-6 rounded-2xl bg-white border border-slate-100 text-center">
          <p className="text-slate-700 font-medium">
            No carers available right now in that area.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Try a longer notice (e.g. &ldquo;Today&rdquo;) or a different
            service. You can also browse the full map.
          </p>
          <a
            href="/find-care/map"
            className="mt-3 inline-block text-sm text-brand-700 underline"
          >
            Browse the map
          </a>
        </div>
      )}

      {matches && matches.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-900">
            {matches.length === 1
              ? "1 carer available"
              : `${matches.length} carers available`}
          </h2>
          {matches.map((m, idx) => (
            <MatchCard
              key={m.user_id}
              match={m}
              isTop={idx === 0}
              onBook={() => bookMatch(m)}
            />
          ))}
        </div>
      )}
    </form>
  );
}

function MatchCard({
  match,
  isTop,
  onBook,
}: {
  match: Match;
  isTop: boolean;
  onBook: () => void;
}) {
  const sym = match.currency === "USD" ? "$" : "£";
  const rate =
    match.hourly_rate_cents != null
      ? `${sym}${(match.hourly_rate_cents / 100).toFixed(0)}/hr`
      : null;
  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-100 flex items-center gap-4">
      <div className="flex-none">
        {match.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={match.photo_url}
            alt=""
            className="w-16 h-16 rounded-full object-cover bg-brand-50"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-semibold">
            {(match.display_name?.trim()[0] ?? "C").toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 truncate">
            {match.display_name ?? "Carer"}
          </span>
          {isTop && (
            <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-medium">
              ⚡ Nearest
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {match.city && <span>{match.city}</span>}
          <span>{match.distance_km} km away</span>
          <span>~{match.eta_minutes_estimate} min ETA</span>
          {rate && <span>{rate}</span>}
          {match.rating_avg != null && (
            <span>★ {match.rating_avg.toFixed(1)}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onBook}
        className="flex-none px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
      >
        Book in 1 tap
      </button>
    </div>
  );
}
