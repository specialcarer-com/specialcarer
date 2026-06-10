import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import MarketingShell from "@/components/marketing-shell";
import CaregiverCard from "@/components/caregiver-card";
import { BookingTypeTabs } from "@/app/book/_components/booking-type-tabs";
import { searchCaregivers, listPublishedCities } from "@/lib/care/search";
import { SERVICES, isServiceKey } from "@/lib/care/services";
import { CARE_FORMATS, isCareFormatKey } from "@/lib/care/formats";
import {
  CERTIFICATIONS,
  GENDERS,
  isCertKey,
  isGenderKey,
  type GenderKey,
} from "@/lib/care/attributes";
import {
  isValidPostcode,
  normalisePostcode,
  inferCountryFromPostcode,
} from "@/lib/care/postcode";
import { geocodePostcode } from "@/lib/mapbox/server";
import { createClient } from "@/lib/supabase/server";
import { US_REGION_ENABLED } from "@/lib/region";

export const metadata: Metadata = {
  title: "Find vetted caregivers — SpecialCarers",
  description:
    "Search DBS-checked, payouts-enabled caregivers across the UK. Filter by service, city, and budget.",
};

export const dynamic = "force-dynamic";

type SearchParams = {
  service?: string;
  format?: string;
  city?: string;
  country?: string;
  min?: string;
  max?: string;
  q?: string;
  date?: string;
  // Postcode-driven geo search
  postcode?: string;
  radius?: string; // km
  // Booking preference filters
  genders?: string | string[];
  driver?: string;
  vehicle?: string;
  certs?: string | string[];
  langs?: string;
  tags?: string;
  more?: string;
};

export default async function FindCarePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("search");
  const sp = await searchParams;
  const rawCountry =
    sp.country === "US" || sp.country === "GB" ? sp.country : undefined;
  // When US region is hidden, force GB so ?country=US in old URLs cannot leak US carers.
  const country = US_REGION_ENABLED ? rawCountry : "GB";
  const service = isServiceKey(sp.service) ? sp.service : undefined;
  const format = isCareFormatKey(sp.format) ? sp.format : undefined;
  const city = sp.city?.trim() || undefined;
  const minRate = sp.min ? Math.max(0, Number(sp.min)) * 100 : undefined;
  const maxRate = sp.max ? Math.max(0, Number(sp.max)) * 100 : undefined;
  const q = sp.q?.trim() || undefined;
  const requestedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;
  const requestedDateLabel = requestedDate
    ? new Date(requestedDate + "T00:00:00").toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : undefined;

  // Booking preference filters
  const sel = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v ? [v] : [];
  const genders = sel(sp.genders).filter(isGenderKey) as GenderKey[];
  const certsSelected = sel(sp.certs).filter(isCertKey);
  const requireDriver = sp.driver === "1" || sp.driver === "on";
  const requireVehicle = sp.vehicle === "1" || sp.vehicle === "on";
  const requiredLanguages = (sp.langs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 30)
    .slice(0, 5);
  const requiredTags = (sp.tags ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s.length <= 30)
    .slice(0, 8);
  // "More filters" section auto-expands if any of those filters are active.
  const moreOpen =
    sp.more === "1" ||
    genders.length > 0 ||
    certsSelected.length > 0 ||
    requireDriver ||
    requireVehicle ||
    requiredLanguages.length > 0 ||
    requiredTags.length > 0;

  // Postcode + radius (additive, optional). Country inferred from the
  // postcode shape when the user hasn't explicitly chosen one.
  const postcodeRaw = sp.postcode?.trim() || undefined;
  const inferredCountry = postcodeRaw
    ? inferCountryFromPostcode(postcodeRaw)
    : null;
  const geoCountry: "GB" | "US" | null = country ?? inferredCountry ?? null;
  const postcode =
    postcodeRaw && isValidPostcode(postcodeRaw, geoCountry ?? "GB")
      ? normalisePostcode(postcodeRaw, geoCountry ?? "GB")
      : null;
  const radiusKm = (() => {
    const n = sp.radius ? Number(sp.radius) : NaN;
    if (!Number.isFinite(n) || n <= 0) return 10; // default 10 km
    return Math.min(50, Math.max(1, Math.round(n)));
  })();
  const geocoded = postcode
    ? await geocodePostcode(postcode, geoCountry ?? "GB")
    : null;
  const near =
    geocoded != null
      ? { lat: geocoded.lat, lng: geocoded.lng, radiusKm }
      : undefined;

  const [results, supabase, citiesAll] = await Promise.all([
    searchCaregivers({
      service,
      format,
      city,
      country,
      minRate,
      maxRate,
      query: q,
      genders,
      requireDriver,
      requireVehicle,
      requiredCertifications: certsSelected,
      requiredLanguages,
      tags: requiredTags,
      near,
    }),
    createClient(),
    // When US region is hidden, only list GB cities so US locations from any
    // stray published US profile cannot leak into the City dropdown. Mirrors
    // the country gate applied to searchCaregivers above (PRs #58/#60).
    listPublishedCities(US_REGION_ENABLED ? undefined : "GB"),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bookable = !!user;

  // Sort by match_score descending
  const sorted = [...results].sort(
    (a, b) => (b.match_score ?? 0) - (a.match_score ?? 0),
  );

  const cityOptions = Array.from(
    new Set(citiesAll.map((c) => c.city)),
  ).sort();

  return (
    <MarketingShell>
      <div className="bg-brand-50 overflow-x-hidden">
      <section className="px-6 py-10 sm:py-14 max-w-6xl mx-auto">
        <BookingTypeTabs current="browse" />
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
              {t("badge")}
            </span>
            <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
              {t("title")}
            </h1>
            <p className="mt-2 text-slate-600 max-w-2xl">{t("subtitle")}</p>
            {requestedDateLabel && (
              <p className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
                <span aria-hidden>→</span>
                {t("showingForDate", { date: requestedDateLabel })}
              </p>
            )}
          </div>
          {!user && (
            <div className="text-sm text-slate-500">
              {t("browsingAsGuest")}{" "}
              <Link
                href="/login?redirectTo=/find-care"
                className="text-brand-700 hover:underline"
              >
                {t("signInToBook")}
              </Link>
              .
            </div>
          )}
        </div>

        {/* Filters */}
        <form
          method="get"
          className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-3 bg-white p-4 rounded-2xl border border-slate-100"
        >
          <label className="text-sm sm:col-span-2 lg:col-span-2">
            <span className="text-slate-700 font-medium">{t("filterSearch")}</span>
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("filterSearchPlaceholder")}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="text-sm sm:col-span-1 lg:col-span-2">
            <span className="text-slate-700 font-medium">
              {US_REGION_ENABLED ? t("filterPostcodeZip") : t("filterPostcode")}
            </span>
            <input
              type="text"
              name="postcode"
              defaultValue={sp.postcode ?? ""}
              placeholder={US_REGION_ENABLED ? t("filterPostcodeZipPlaceholder") : t("filterPostcodePlaceholder")}
              autoComplete="postal-code"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">{t("filterWithin")}</span>
            <select
              name="radius"
              defaultValue={String(radiusKm)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="20">20 km</option>
              <option value="30">30 km</option>
              <option value="50">50 km</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">{t("filterWorkType")}</span>
            <select
              name="format"
              defaultValue={format ?? ""}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">{t("any")}</option>
              {CARE_FORMATS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.short}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">{t("filterService")}</span>
            <select
              name="service"
              defaultValue={service ?? ""}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">{t("anyService")}</option>
              {SERVICES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">{t("filterCity")}</span>
            <select
              name="city"
              defaultValue={city ?? ""}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">{t("anyCity")}</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {US_REGION_ENABLED && (
            <label className="text-sm">
              <span className="text-slate-700 font-medium">{t("filterCountry")}</span>
              <select
                name="country"
                defaultValue={country ?? ""}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="">{t("countryBoth")}</option>
                <option value="GB">{t("countryGB")}</option>
                <option value="US">{t("countryUS")}</option>
              </select>
            </label>
          )}
          <div className="text-sm grid grid-cols-2 gap-2">
            <label>
              <span className="text-slate-700 font-medium">{t("filterMinRate")}</span>
              <input
                type="number"
                name="min"
                inputMode="numeric"
                min={0}
                defaultValue={sp.min ?? ""}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200"
              />
            </label>
            <label>
              <span className="text-slate-700 font-medium">{t("filterMaxRate")}</span>
              <input
                type="number"
                name="max"
                inputMode="numeric"
                min={0}
                defaultValue={sp.max ?? ""}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200"
              />
            </label>
          </div>
          {/* More filters (collapsible) */}
          <details
            open={moreOpen}
            className="sm:col-span-2 lg:col-span-8 mt-1 group"
          >
            <summary className="cursor-pointer text-sm font-medium text-brand-700 hover:underline list-none flex items-center gap-1.5">
              <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
              {t("moreFilters")}
              {(genders.length +
                certsSelected.length +
                (requireDriver ? 1 : 0) +
                (requireVehicle ? 1 : 0) +
                requiredLanguages.length +
                requiredTags.length) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-brand text-white text-[11px]">
                  {genders.length +
                    certsSelected.length +
                    (requireDriver ? 1 : 0) +
                    (requireVehicle ? 1 : 0) +
                    requiredLanguages.length +
                    requiredTags.length}
                </span>
              )}
            </summary>
            {/* hidden input keeps the section open after submit */}
            <input type="hidden" name="more" value="1" />

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">
                  {t("gender")}
                </legend>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("genderHint")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {GENDERS.map((g) => {
                    const on = (genders as string[]).includes(g.key);
                    return (
                      <label
                        key={g.key}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition ${
                          on
                            ? "bg-brand text-white border-brand"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="genders"
                          value={g.key}
                          defaultChecked={on}
                          className="sr-only"
                        />
                        {g.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium text-slate-700">
                  {t("travel")}
                </legend>
                <div className="mt-2 flex flex-col gap-1.5">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="driver"
                      value="1"
                      defaultChecked={requireDriver}
                      className="h-4 w-4 accent-brand"
                    />
                    {t("hasLicence")}
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="vehicle"
                      value="1"
                      defaultChecked={requireVehicle}
                      className="h-4 w-4 accent-brand"
                    />
                    {t("hasVehicle")}
                  </label>
                </div>
              </fieldset>

              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium text-slate-700">
                  {t("requiredCerts")}
                </legend>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("requiredCertsHint")}
                </p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {CERTIFICATIONS.map((c) => {
                    const on = certsSelected.includes(c.key);
                    return (
                      <label
                        key={c.key}
                        className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border transition ${
                          on
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="certs"
                          value={c.key}
                          defaultChecked={on}
                          className="sr-only"
                        />
                        {c.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className="text-sm">
                <span className="text-slate-700 font-medium">
                  {t("languagesRequired")}
                </span>
                <span className="block text-xs text-slate-500 mb-1">
                  {t("languagesHint")}
                </span>
                <input
                  type="text"
                  name="langs"
                  defaultValue={requiredLanguages.join(", ")}
                  placeholder={t("languagesPlaceholder")}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </label>

              <label className="text-sm">
                <span className="text-slate-700 font-medium">
                  {t("carerTags")}
                </span>
                <span className="block text-xs text-slate-500 mb-1">
                  {t("carerTagsHint")}
                </span>
                <input
                  type="text"
                  name="tags"
                  defaultValue={requiredTags.join(", ")}
                  placeholder={t("carerTagsPlaceholder")}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </label>
            </div>
          </details>

          <div className="sm:col-span-2 lg:col-span-8 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between pt-1">
            <p className="text-xs text-slate-500">
              {t("ratesNote")}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Link
                href="/find-care"
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                {t("reset")}
              </Link>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
              >
                {t("applyFilters")}
              </button>
            </div>
          </div>
        </form>

        {/* List ↔ Map view toggle */}
        <div className="mt-6 flex items-center gap-2">
          <span aria-hidden className="px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold">
            {t("listView")}
          </span>
          <Link
            href={(() => {
              const qs = new URLSearchParams();
              if (postcode) qs.set("postcode", postcode);
              qs.set("radius", String(radiusKm));
              if (service) qs.set("service", service);
              if (format) qs.set("format", format);
              if (city) qs.set("city", city);
              if (country) qs.set("country", country);
              return `/find-care/map${qs.toString() ? `?${qs}` : ""}`;
            })()}
            className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 transition"
          >
            {t("mapView")} →
          </Link>
          {near && geocoded && (
            <span className="ml-auto text-xs text-slate-500">
              {t("withinRadius", {
                radius: radiusKm,
                place: `${postcode}${geocoded.city ? ` · ${geocoded.city}` : ""}`,
              })}
            </span>
          )}
        </div>

        {/* Results */}
        <div className="mt-8 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("resultsCount", { count: sorted.length })}
          </h2>
          {service && (
            <Link
              href={SERVICES.find((s) => s.key === service)?.href ?? "/"}
              className="text-sm text-brand-700 hover:underline"
            >
              {t("aboutService")} →
            </Link>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="mt-6 p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center">
            <p className="text-slate-700 font-medium">
              {t("noResultsTitle")}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {t("noResultsBody")}
            </p>
            <Link
              href="/find-care"
              className="mt-4 inline-block px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
            >
              {t("resetFilters")}
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sorted.map((c) => (
              <li key={c.user_id} className="min-w-0">
                <CaregiverCard c={c} bookable={bookable} />
              </li>
            ))}
          </ul>
        )}

        {/* Help footer — each card on a distinct, brand-appropriate
            background so the three topics read as separate at a glance:
              • trust   → white card + teal border (sits crisply on the
                          page's bg-brand-50 wash)
              • cost    → soft amber tint
              • support → neutral slate. */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="bg-white p-5 rounded-2xl border border-brand-100 shadow-sm">
            <h3 className="font-semibold text-slate-900">{t("vettingTitle")}</h3>
            <p className="mt-1 text-slate-700">
              {t("vettingBody")}{" "}
              <Link href="/trust" className="text-brand-700 hover:underline">
                {t("vettingLink")}
              </Link>
              .
            </p>
          </div>
          <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100">
            <h3 className="font-semibold text-slate-900">{t("costTitle")}</h3>
            <p className="mt-1 text-slate-700">
              {t("costBody")}{" "}
              <Link href="/pricing" className="text-brand-700 hover:underline">
                {t("costLink")}
              </Link>
              .
            </p>
          </div>
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <h3 className="font-semibold text-slate-900">{t("helpTitle")}</h3>
            <p className="mt-1 text-slate-700">
              {t("helpBody")}{" "}
              <a
                href="mailto:support@specialcarer.com"
                className="text-brand-700 hover:underline"
              >
                support@specialcarer.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>
      </div>
    </MarketingShell>
  );
}
