import type { Metadata } from "next";
import MarketingShell from "@/components/marketing-shell";
import CoverageMap from "@/components/coverage-map";
import { listCoverageCities } from "@/lib/coverage-server";
import { COVERAGE_STATUS_LABEL } from "@/lib/coverage-types";
import CityFilters from "./CityFilters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Where SpecialCarer is available — Coverage map",
  description:
    "Care, in 25+ cities across the UK and US. See where SpecialCarer is live, on the waitlist, and coming soon. Search by postcode or ZIP.",
  alternates: { canonical: "https://specialcarer.com/coverage" },
};

export default async function CoveragePage() {
  const cities = await listCoverageCities();
  const liveCount = cities.filter((c) => c.status === "live").length;
  const waitlistCount = cities.filter((c) => c.status === "waitlist").length;

  // SEO: ItemList of cities with their coordinates.
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListOrder: "Unordered",
    numberOfItems: cities.length,
    itemListElement: cities.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://specialcarer.com/coverage/${c.slug}`,
      item: {
        "@type": "Place",
        name: c.name,
        address: {
          "@type": "PostalAddress",
          addressCountry: c.country,
          addressRegion: c.region ?? undefined,
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: c.lat,
          longitude: c.lng,
        },
      },
    })),
  };

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <article>
        {/* Hero */}
        <section className="px-6 pt-14 pb-8">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              Coverage
            </p>
            <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
              Care, in {cities.length}+ cities across the UK and US
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600">
              {liveCount} cities live. {waitlistCount} more on the waitlist.
              Find the closest one — or join the queue if we&rsquo;re not in
              your area yet.
            </p>
          </div>
        </section>

        {/* Map */}
        <section className="px-2 sm:px-6 pb-10">
          <div className="max-w-6xl mx-auto">
            <CoverageMap
              cities={cities}
              height="70vh"
              initialBounds="all"
              className="shadow-sm"
            />

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600 px-1">
              <LegendDot tone="live" label={COVERAGE_STATUS_LABEL.live} />
              <LegendDot
                tone="waitlist"
                label={COVERAGE_STATUS_LABEL.waitlist}
              />
              <LegendDot
                tone="coming_soon"
                label={COVERAGE_STATUS_LABEL.coming_soon}
              />
            </div>
          </div>
        </section>

        {/* Filters + grid */}
        <section className="px-6 pb-20">
          <div className="max-w-6xl mx-auto">
            <CityFilters cities={cities} />
          </div>
        </section>
      </article>
    </MarketingShell>
  );
}

function LegendDot({
  tone,
  label,
}: {
  tone: "live" | "waitlist" | "coming_soon";
  label: string;
}) {
  const fill =
    tone === "live"
      ? "bg-[#039EA0] border-white"
      : tone === "waitlist"
        ? "bg-transparent border-[#039EA0]"
        : "bg-slate-400 border-white";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded-full border-2 ${fill}`} />
      {label}
    </span>
  );
}
