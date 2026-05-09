"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  COVERAGE_VERTICALS,
  COVERAGE_VERTICAL_LABEL,
  COVERAGE_STATUS_LABEL,
  flagFor,
  haversineKm,
  type CoverageCity,
  type CoverageCountry,
  type CoverageStatus,
  type CoverageVertical,
} from "@/lib/coverage-types";

type CountryFilter = CoverageCountry | "all";
type StatusFilter = CoverageStatus | "all";
type VerticalFilter = CoverageVertical | "all";

type GeocodeFeature = {
  text: string;
  place_name: string;
  center: [number, number];
};

type Props = {
  cities: CoverageCity[];
};

export default function CityFilters({ cities }: Props) {
  const [country, setCountry] = useState<CountryFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [vertical, setVertical] = useState<VerticalFilter>("all");

  const filtered = useMemo(() => {
    return cities.filter((c) => {
      if (country !== "all" && c.country !== country) return false;
      if (status !== "all" && c.status !== status) return false;
      if (vertical !== "all" && !c.verticals.includes(vertical)) return false;
      return true;
    });
  }, [cities, country, status, vertical]);

  return (
    <div>
      <PostcodeSearch cities={cities} />

      <div className="mt-8 flex flex-wrap gap-3 items-end">
        <FilterGroup
          label="Country"
          value={country}
          onChange={(v) => setCountry(v as CountryFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "UK", label: "UK" },
            { value: "US", label: "US" },
          ]}
        />
        <FilterGroup
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "live", label: "Live" },
            { value: "waitlist", label: "Waitlist" },
            { value: "coming_soon", label: "Coming soon" },
          ]}
        />
        <FilterGroup
          label="Vertical"
          value={vertical}
          onChange={(v) => setVertical(v as VerticalFilter)}
          options={[
            { value: "all", label: "All" },
            ...COVERAGE_VERTICALS.map((v) => ({
              value: v,
              label: COVERAGE_VERTICAL_LABEL[v],
            })),
          ]}
        />
        <p className="ml-auto text-sm text-slate-500" aria-live="polite">
          Showing {filtered.length} of {cities.length}
        </p>
      </div>

      <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((c) => (
          <li
            key={c.slug}
            className="rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">
                  {flagFor(c.country)} {c.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {c.region ?? c.country}
                </p>
              </div>
              <StatusPill status={c.status} />
            </div>
            {c.status === "live" && (
              <p className="mt-2 text-xs text-slate-600">
                {c.carer_count} carers · {c.avg_response_min ?? "—"} min avg
                response
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500 line-clamp-2">
              {c.verticals
                .map((v) => COVERAGE_VERTICAL_LABEL[v])
                .join(", ") || "—"}
            </p>
            <Link
              href={`/coverage/${c.slug}`}
              className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
            >
              Learn more →
            </Link>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="mt-6 text-sm text-slate-600">
          No cities match those filters yet.
        </p>
      )}
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusPill({ status }: { status: CoverageStatus }) {
  const tone =
    status === "live"
      ? "bg-brand-50 text-brand-700 border-brand-100"
      : status === "waitlist"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${tone}`}
    >
      {COVERAGE_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Postcode / zip search panel. Geocodes via the public Mapbox token
 * fetched from /api/mapbox/config (never the env var directly).
 */
function PostcodeSearch({ cities }: { cities: CoverageCity[] }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    place: string;
    nearest: CoverageCity;
    distanceKm: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const cfg = await fetch("/api/mapbox/config", {
        cache: "no-store",
      }).then((r) => r.json() as Promise<{ token?: string; stub?: boolean }>);
      if (!cfg.token || cfg.stub) {
        setErr("Search is unavailable right now. Please try again later.");
        return;
      }
      const trimmed = query.trim();
      if (!trimmed) {
        setErr("Enter a postcode or ZIP.");
        return;
      }
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        trimmed,
      )}.json?types=postcode,locality,place&country=GB,US&limit=1&access_token=${cfg.token}`;
      const res = await fetch(url);
      if (!res.ok) {
        setErr("Could not look up that postcode.");
        return;
      }
      const j = (await res.json()) as { features?: GeocodeFeature[] };
      const feat = j.features?.[0];
      if (!feat) {
        setErr("We couldn't find that postcode. Try a city name?");
        return;
      }
      const [lng, lat] = feat.center;

      // Find the nearest LIVE city.
      const live = cities.filter((c) => c.status === "live");
      if (live.length === 0) {
        setErr("No live cities to compare against yet.");
        return;
      }
      let best = live[0];
      let bestKm = haversineKm({ lat, lng }, { lat: best.lat, lng: best.lng });
      for (const c of live) {
        const d = haversineKm({ lat, lng }, { lat: c.lat, lng: c.lng });
        if (d < bestKm) {
          best = c;
          bestKm = d;
        }
      }
      setResult({
        place: feat.place_name,
        nearest: best,
        distanceKm: bestKm,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="postcode-search-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <h2
        id="postcode-search-heading"
        className="text-lg font-semibold text-slate-900"
      >
        Find care near you
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Enter a UK postcode or US ZIP — we&rsquo;ll show the closest live city.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
          placeholder="e.g. EC1A 1BB or 10001"
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          aria-label="Postcode or ZIP"
        />
        <button
          type="button"
          onClick={search}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-60"
        >
          {busy ? "Searching…" : "Find nearest"}
        </button>
      </div>
      {err && (
        <p className="mt-2 text-sm text-rose-700" aria-live="polite">
          {err}
        </p>
      )}
      {result && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            For <span className="font-semibold">{result.place}</span>:
          </p>
          {result.distanceKm <= 50 ? (
            <p className="mt-1 text-base">
              <span className="font-semibold">
                {flagFor(result.nearest.country)} {result.nearest.name}
              </span>{" "}
              is the closest live city ({result.distanceKm.toFixed(0)} km).{" "}
              <Link
                href={`/coverage/${result.nearest.slug}`}
                className="font-semibold text-brand-700 hover:underline"
              >
                See {result.nearest.name} →
              </Link>
            </p>
          ) : (
            <>
              <p className="mt-1 text-base text-slate-900">
                We are not in your area yet — the nearest live city is{" "}
                <span className="font-semibold">
                  {flagFor(result.nearest.country)} {result.nearest.name}
                </span>{" "}
                ({result.distanceKm.toFixed(0)} km).
              </p>
              <Link
                href={`/waitlist?city=${result.nearest.slug}`}
                className="mt-3 inline-block px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-600"
              >
                Join the {result.nearest.name} waitlist →
              </Link>
            </>
          )}
        </div>
      )}
    </section>
  );
}
