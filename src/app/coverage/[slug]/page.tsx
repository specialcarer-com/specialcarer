import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MarketingShell from "@/components/marketing-shell";
import {
  COVERAGE_STATUS_LABEL,
  COVERAGE_VERTICAL_LABEL,
  flagFor,
  haversineKm,
  type CoverageCity,
  type CoverageStatus,
} from "@/lib/coverage-types";
import {
  getCoverageCity,
  listCoverageCities,
} from "@/lib/coverage-server";

export const dynamic = "force-dynamic";

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const cities = await listCoverageCities();
  return cities.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const city = await getCoverageCity(slug);
  if (!city) {
    return { title: "City not found — SpecialCarer" };
  }
  const verbForStatus =
    city.status === "live"
      ? `Vetted carers in ${city.name}`
      : city.status === "waitlist"
        ? `Join the ${city.name} waitlist`
        : `${city.name} is coming soon`;
  return {
    title: `${verbForStatus} — SpecialCarer`,
    description:
      city.status === "live"
        ? `${city.carer_count} background-checked carers in ${city.name}, ${city.region ?? city.country}. Average response ${city.avg_response_min ?? "—"} min. Book online.`
        : `Be among the first to hear when SpecialCarer launches in ${city.name}, ${city.region ?? city.country}.`,
    alternates: {
      canonical: `https://specialcarer.com/coverage/${city.slug}`,
    },
  };
}

export default async function CoverageCityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const city = await getCoverageCity(slug);
  if (!city) notFound();
  const all = await listCoverageCities();
  const others = nearestOthers(city, all, 3);

  const ld = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `https://specialcarer.com/coverage/${city.slug}`,
    name: `SpecialCarer — ${city.name}`,
    url: `https://specialcarer.com/coverage/${city.slug}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: city.name,
      addressRegion: city.region ?? undefined,
      addressCountry: city.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: city.lat,
      longitude: city.lng,
    },
    areaServed: {
      "@type": "City",
      name: city.name,
    },
  };

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <article>
        {/* Hero */}
        <section className="px-6 pt-12 pb-10">
          <div className="max-w-4xl mx-auto">
            <p className="text-sm">
              <Link
                href="/coverage"
                className="text-slate-500 hover:text-slate-700"
              >
                ← All coverage
              </Link>
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
                <span aria-hidden>{flagFor(city.country)}</span>{" "}
                {city.name}
              </h1>
              <StatusPill status={city.status} />
            </div>
            <p className="mt-2 text-base text-slate-600">
              {city.region ?? city.country}
              {city.timezone ? ` · ${city.timezone}` : ""}
            </p>

            {/* Hero photo placeholder. Replace src with a real city image
                when available; in the meantime a gradient placeholder
                keeps the layout clean. */}
            <div
              className="mt-6 aspect-[16/7] w-full rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-50 via-white to-brand-100"
              aria-hidden
            />

            <div className="mt-6">
              <PrimaryCta city={city} />
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="px-6 pb-10">
          <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-3">
            <Stat
              label="Carers"
              value={city.status === "live" ? `${city.carer_count}` : "—"}
              hint={
                city.status === "live"
                  ? "Vetted, background-checked"
                  : "Launching soon"
              }
            />
            <Stat
              label="Avg response"
              value={
                city.avg_response_min != null
                  ? `${city.avg_response_min} min`
                  : "—"
              }
              hint={
                city.status === "live"
                  ? "Median over the last 30 days"
                  : "Available at launch"
              }
            />
            <Stat
              label="Verticals"
              value={`${city.verticals.length}`}
              hint={`Out of ${5}`}
            />
          </div>
        </section>

        {/* Verticals strip */}
        {city.verticals.length > 0 && (
          <section className="px-6 pb-12">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-lg font-semibold text-slate-900">
                Care offered in {city.name}
              </h2>
              <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {city.verticals.map((v) => (
                  <li key={v}>
                    <Link
                      href={verticalHref(v)}
                      className="block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm hover:border-brand-100 transition"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {COVERAGE_VERTICAL_LABEL[v]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Learn more →
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Nearby cities */}
        {others.length > 0 && (
          <section className="px-6 pb-16">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-lg font-semibold text-slate-900">
                Other cities nearby
              </h2>
              <ul className="mt-4 grid sm:grid-cols-3 gap-3">
                {others.map((o) => (
                  <li
                    key={o.slug}
                    className="rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm transition"
                  >
                    <Link
                      href={`/coverage/${o.slug}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {flagFor(o.country)} {o.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {o.region ?? o.country} ·{" "}
                          {haversineKm(city, o).toFixed(0)} km
                        </p>
                      </div>
                      <StatusPill status={o.status} small />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </article>
    </MarketingShell>
  );
}

function nearestOthers(
  city: CoverageCity,
  all: CoverageCity[],
  n: number,
): CoverageCity[] {
  return all
    .filter((c) => c.slug !== city.slug)
    .map((c) => ({ city: c, km: haversineKm(city, c) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n)
    .map((x) => x.city);
}

function verticalHref(v: CoverageCity["verticals"][number]): string {
  const map: Record<string, string> = {
    elderly_care: "/services/elderly-care",
    childcare: "/services/childcare",
    special_needs: "/services/special-needs",
    postnatal: "/services/postnatal",
    complex_care: "/services/complex-care",
  };
  return map[v] ?? "/find-care";
}

function PrimaryCta({ city }: { city: CoverageCity }) {
  const cls =
    "inline-flex items-center justify-center px-6 py-3 rounded-xl bg-brand text-white text-base font-semibold hover:bg-brand-600 transition";
  if (city.status === "live") {
    return (
      <Link href={`/find-care?city=${city.slug}`} className={cls}>
        Book a carer in {city.name} →
      </Link>
    );
  }
  if (city.status === "waitlist") {
    return (
      <Link href={`/waitlist?city=${city.slug}`} className={cls}>
        Join the {city.name} waitlist →
      </Link>
    );
  }
  return (
    <Link href={`/waitlist?city=${city.slug}`} className={cls}>
      Notify me when we launch in {city.name} →
    </Link>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function StatusPill({
  status,
  small = false,
}: {
  status: CoverageStatus;
  small?: boolean;
}) {
  const tone =
    status === "live"
      ? "bg-brand-50 text-brand-700 border-brand-100"
      : status === "waitlist"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-slate-100 text-slate-600 border-slate-200";
  const size = small
    ? "text-[10px] px-1.5 py-0.5"
    : "text-[11px] px-2 py-0.5";
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full border font-semibold ${size} ${tone}`}
    >
      {COVERAGE_STATUS_LABEL[status]}
    </span>
  );
}
