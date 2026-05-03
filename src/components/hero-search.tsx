"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SERVICES } from "@/lib/care/services";

type CityOpt = {
  city: string;
  country: "GB" | "US";
  slug: string;
  countrySlug: "uk" | "us";
};

export default function HeroSearch({ cities }: { cities: CityOpt[] }) {
  const router = useRouter();
  const [service, setService] = useState<string>("");
  const [cityKey, setCityKey] = useState<string>(""); // `${countrySlug}|${city}`
  const [submitting, setSubmitting] = useState(false);

  const cityIndex = useMemo(() => {
    const m = new Map<string, CityOpt>();
    for (const c of cities) m.set(`${c.countrySlug}|${c.city}`, c);
    return m;
  }, [cities]);

  // Group cities under their country for a clean optgroup UX
  const grouped = useMemo(() => {
    const uk: CityOpt[] = [];
    const us: CityOpt[] = [];
    for (const c of cities) (c.country === "GB" ? uk : us).push(c);
    return { uk, us };
  }, [cities]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const params = new URLSearchParams();
    if (service) params.set("service", service);
    if (cityKey) {
      const c = cityIndex.get(cityKey);
      if (c) {
        params.set("city", c.city);
        params.set("country", c.country);
      }
    }

    const qs = params.toString();
    router.push(qs ? `/find-care?${qs}` : "/find-care");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-10 mx-auto max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-sm p-3 sm:p-2 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 text-left"
      aria-label="Find care"
    >
      <label className="sr-only" htmlFor="hero-service">
        Service
      </label>
      <div className="relative">
        <span className="absolute left-3 top-2 text-[10px] uppercase tracking-wider text-slate-500 pointer-events-none">
          What do you need?
        </span>
        <select
          id="hero-service"
          name="service"
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="w-full h-14 pl-3 pr-8 pt-5 pb-1 rounded-xl bg-slate-50 sm:bg-white text-slate-900 text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Any care type</option>
          {SERVICES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <Chevron />
      </div>

      <label className="sr-only" htmlFor="hero-city">
        City
      </label>
      <div className="relative">
        <span className="absolute left-3 top-2 text-[10px] uppercase tracking-wider text-slate-500 pointer-events-none">
          Where?
        </span>
        <select
          id="hero-city"
          name="city"
          value={cityKey}
          onChange={(e) => setCityKey(e.target.value)}
          className="w-full h-14 pl-3 pr-8 pt-5 pb-1 rounded-xl bg-slate-50 sm:bg-white text-slate-900 text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Any city</option>
          {grouped.uk.length > 0 && (
            <optgroup label="United Kingdom">
              {grouped.uk.map((c) => (
                <option
                  key={`uk-${c.city}`}
                  value={`${c.countrySlug}|${c.city}`}
                >
                  {c.city}
                </option>
              ))}
            </optgroup>
          )}
          {grouped.us.length > 0 && (
            <optgroup label="United States">
              {grouped.us.map((c) => (
                <option
                  key={`us-${c.city}`}
                  value={`${c.countrySlug}|${c.city}`}
                >
                  {c.city}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <Chevron />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="h-14 px-6 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-600 transition disabled:opacity-70"
      >
        {submitting ? "Searching…" : "Find care"}
      </button>
    </form>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
      fill="currentColor"
    >
      <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
    </svg>
  );
}
