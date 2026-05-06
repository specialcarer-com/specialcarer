"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Avatar,
  BottomNav,
  Button,
  Card,
  CarerBadges,
  IconFilter,
  IconPin,
  IconSearch,
  IconStar,
  Tag,
  TopBar,
} from "../_components/ui";
import { CAREGIVERS, SERVICE_LABEL } from "../_lib/mock";
import { CERTIFICATIONS, GENDERS } from "@/lib/care/attributes";
import {
  classifyPostcode,
  inferCountryFromPostcode,
  normalisePostcode,
} from "@/lib/care/postcode";

/**
 * Search / discovery — there's no Figma frame for this exact screen
 * (the design jumps from Home to Carer Profile), so we built a clean
 * one consistent with the design system: search bar at top, scrollable
 * service-chip filters, then the same card style as Home.
 */

const SERVICES = [
  { key: "all", label: "All" },
  { key: "child", label: "Childcare" },
  { key: "elderly", label: "Elderly care" },
  { key: "special", label: "Special-needs" },
  { key: "postnatal", label: "Postnatal support" },
  { key: "complex", label: "Complex care" },
] as const;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [service, setService] = useState<(typeof SERVICES)[number]["key"]>("all");
  // Credential filters — honour the FAQ promise that complex clinical
  // bookings only land with credentialed carers. Both default off so
  // the filter is opt-in; selecting nurse implies clinical at the
  // matcher level (a nurse always satisfies the clinical filter).
  const [needClinical, setNeedClinical] = useState(false);
  const [needNurse, setNeedNurse] = useState(false);

  // Postcode + radius filter (additive). Mobile uses mock data, so the
  // postcode acts as a textual prefix match against carer city/postcode
  // metadata for now — the same UI sends the value to the real geo search
  // when wired through to /find-care/map.
  const [postcode, setPostcode] = useState("");
  const [radiusKm, setRadiusKm] = useState<number>(10);

  // Booking preference filters (additive, work alongside the existing
  // credential filters). Backed by an opt-in bottom-sheet panel.
  const [filterOpen, setFilterOpen] = useState(false);
  const [genders, setGenders] = useState<string[]>([]);
  const [needDriver, setNeedDriver] = useState(false);
  const [needVehicle, setNeedVehicle] = useState(false);
  const [requiredCerts, setRequiredCerts] = useState<string[]>([]);
  const [requiredLangs, setRequiredLangs] = useState<string>("");
  const [requiredTags, setRequiredTags] = useState<string>("");

  const activeExtraCount =
    genders.length +
    requiredCerts.length +
    (needDriver ? 1 : 0) +
    (needVehicle ? 1 : 0) +
    requiredLangs.split(",").map((s) => s.trim()).filter(Boolean).length +
    requiredTags.split(",").map((s) => s.trim()).filter(Boolean).length +
    (postcode.trim().length > 0 ? 1 : 0);

  // Postcode classification — used to decide whether to show the radius
  // selector and to build the deep link to the desktop map view (which has
  // server-side geo search wired in).
  const postcodeShape = useMemo(
    () => classifyPostcode(postcode, inferCountryFromPostcode(postcode) ?? undefined),
    [postcode],
  );
  const postcodeValid = postcodeShape !== "invalid";
  const inferredCountry = inferCountryFromPostcode(postcode);
  const mapHref = useMemo(() => {
    const params = new URLSearchParams();
    if (postcodeValid && inferredCountry) {
      const norm = normalisePostcode(postcode, inferredCountry);
      if (norm) {
        params.set("postcode", norm);
        params.set("radius", String(radiusKm));
      }
    }
    if (service !== "all") params.set("service", String(service));
    return `/find-care/map${params.toString() ? "?" + params.toString() : ""}`;
  }, [postcode, postcodeValid, inferredCountry, radiusKm, service]);

  function toggleGender(k: string) {
    setGenders((prev) => (prev.includes(k) ? prev.filter((g) => g !== k) : [...prev, k]));
  }
  function toggleCert(k: string) {
    setRequiredCerts((prev) =>
      prev.includes(k) ? prev.filter((c) => c !== k) : [...prev, k],
    );
  }
  function clearExtras() {
    setGenders([]);
    setNeedDriver(false);
    setNeedVehicle(false);
    setRequiredCerts([]);
    setRequiredLangs("");
    setRequiredTags("");
    setPostcode("");
    setRadiusKm(10);
  }

  const results = useMemo(() => {
    const reqLangs = requiredLangs
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const reqTags = requiredTags
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const pcTrim = postcode.trim().toUpperCase();
    return CAREGIVERS.filter((c) => {
      if (service !== "all" && !c.services.includes(service as never)) return false;
      // Mock data lacks postcodes — we use the city as a soft proxy so the
      // input still narrows results in dev. Real geo search runs on the
      // server (used by /find-care + /find-care/map) once the user taps
      // 'View on map'.
      if (pcTrim) {
        const country = inferCountryFromPostcode(pcTrim);
        const knownUkCity =
          country === "GB" &&
          /^E|^EC|^N|^NW|^SE|^SW|^W|^WC/.test(pcTrim) ? "London" :
          country === "GB" && pcTrim.startsWith("M") ? "Manchester" :
          country === "GB" && pcTrim.startsWith("B") ? "Birmingham" :
          null;
        const knownUsCity =
          country === "US" && pcTrim.startsWith("100") ? "New York" :
          country === "US" && pcTrim.startsWith("900") ? "Los Angeles" :
          null;
        const targetCity = knownUkCity ?? knownUsCity;
        if (targetCity && c.city !== targetCity) return false;
      }
      if (needNurse && !c.isNurse) return false;
      if (needClinical && !(c.isClinical || c.isNurse)) return false;
      // Booking preference filters — mock data may not have these fields,
      // so we treat missing fields as "no info" and let them through unless
      // strict requirements (driver/vehicle/certs) cannot be satisfied.
      const cAny = c as unknown as {
        gender?: string;
        hasLicense?: boolean;
        hasVehicle?: boolean;
        certifications?: string[];
        tags?: string[];
      };
      if (genders.length > 0 && cAny.gender && !genders.includes(cAny.gender)) {
        return false;
      }
      if (needDriver && cAny.hasLicense === false) return false;
      if (needVehicle && cAny.hasVehicle === false) return false;
      if (requiredCerts.length > 0) {
        const have = new Set(cAny.certifications ?? []);
        if (!requiredCerts.every((k) => have.has(k))) return false;
      }
      if (reqLangs.length > 0) {
        const have = c.languages.map((l) => l.toLowerCase());
        if (!reqLangs.every((l) => have.includes(l))) return false;
      }
      if (reqTags.length > 0) {
        const have = (cAny.tags ?? []).map((t) => t.toLowerCase());
        if (!reqTags.every((t) => have.includes(t))) return false;
      }
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      return (
        c.name.toLowerCase().includes(needle) ||
        c.city.toLowerCase().includes(needle) ||
        c.languages.some((l) => l.toLowerCase().includes(needle))
      );
    });
  }, [
    q,
    service,
    needClinical,
    needNurse,
    genders,
    needDriver,
    needVehicle,
    requiredCerts,
    requiredLangs,
    requiredTags,
    postcode,
  ]);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar back="/m/home" title="Find a Carer" />

      <div className="px-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-12 rounded-btn border border-line bg-white px-4 flex items-center gap-2">
            <IconSearch />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, city or language"
              className="flex-1 bg-transparent outline-none text-[14px] text-heading placeholder:text-[#A3A3A3]"
            />
          </div>
          <button
            aria-label="Filter"
            onClick={() => setFilterOpen(true)}
            className="relative h-12 w-12 rounded-btn bg-primary text-white grid place-items-center sc-no-select"
          >
            <IconFilter />
            {activeExtraCount > 0 && (
              <span
                aria-hidden
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-primary text-[11px] font-bold grid place-items-center border border-primary"
              >
                {activeExtraCount}
              </span>
            )}
          </button>
        </div>

        {/* Service chips */}
        <div className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto pb-2 sc-no-select">
          {SERVICES.map((s) => {
            const active = s.key === service;
            return (
              <button
                key={s.key}
                onClick={() => setService(s.key)}
                className={`shrink-0 h-9 px-4 rounded-pill text-[13px] font-semibold transition ${
                  active
                    ? "bg-primary text-white"
                    : "bg-white text-subheading border border-line"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Credential filters */}
        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-2 sc-no-select">
          <button
            onClick={() => setNeedClinical((v) => !v)}
            aria-pressed={needClinical}
            className={`shrink-0 h-9 px-3 rounded-pill text-[13px] font-semibold transition inline-flex items-center gap-1.5 ${
              needClinical
                ? "text-white"
                : "bg-white text-subheading border border-line"
            }`}
            style={needClinical ? { background: "#1F4FA8" } : undefined}
          >
            <span>⚕</span> Clinical experience
          </button>
          <button
            onClick={() => setNeedNurse((v) => !v)}
            aria-pressed={needNurse}
            className={`shrink-0 h-9 px-3 rounded-pill text-[13px] font-semibold transition inline-flex items-center gap-1.5 ${
              needNurse
                ? "text-white"
                : "bg-white text-subheading border border-line"
            }`}
            style={needNurse ? { background: "#8B2A3D" } : undefined}
          >
            <span>✚</span> Qualified nurse
          </button>
        </div>

        {/* Postcode + radius (additive) */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-11 rounded-btn border border-line bg-white px-3 flex items-center gap-2">
            <IconPin />
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value.toUpperCase())}
              inputMode="text"
              autoComplete="postal-code"
              maxLength={10}
              placeholder="Postcode or ZIP"
              className="flex-1 bg-transparent outline-none text-[14px] text-heading placeholder:text-[#A3A3A3]"
              aria-label="Postcode or ZIP"
            />
          </div>
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            aria-label="Search radius"
            disabled={!postcodeValid || !postcode.trim()}
            className="h-11 px-2 rounded-btn border border-line bg-white text-[13px] font-semibold text-heading disabled:opacity-50"
          >
            <option value={5}>5 km</option>
            <option value={10}>10 km</option>
            <option value={20}>20 km</option>
            <option value={30}>30 km</option>
            <option value={50}>50 km</option>
          </select>
        </div>
        {!postcodeValid && postcode.trim().length > 0 && (
          <p className="mt-1 text-[12px] text-status-error-fg">
            Enter a valid UK postcode (e.g. SW1A 1AA) or US ZIP (e.g. 10001).
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <p className="text-[12px] text-subheading">
            {results.length} {results.length === 1 ? "carer" : "carers"} found
          </p>
          <Link
            href={mapHref}
            className="text-[13px] font-semibold text-primary inline-flex items-center gap-1"
            aria-label="View on map"
          >
            <IconPin /> View on map
          </Link>
        </div>
      </div>

      <div className="px-4 mt-3 space-y-4">
        {results.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start gap-3">
              <Avatar src={c.photo} name={c.name} size={56} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[16px] font-bold text-heading truncate">
                    {c.name}
                  </p>
                  <span className="flex items-center gap-1 text-[13px] font-bold text-heading shrink-0">
                    {c.rating.toFixed(1)} <IconStar />
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {c.services.slice(0, 2).map((s) => (
                    <Tag key={s} tone="primary">
                      {SERVICE_LABEL[s]}
                    </Tag>
                  ))}
                  <CarerBadges
                    isClinical={c.isClinical}
                    isNurse={c.isNurse}
                    compact
                  />
                </div>
              </div>
            </div>

            <ul className="mt-3 space-y-2 text-[13px] text-heading">
              <li className="flex items-center gap-2">
                <span className="text-subheading"><IconPin /></span>
                {c.city}
              </li>
            </ul>

            <div className="border-t border-line mt-4 pt-3 flex items-center justify-between">
              <p className="text-[12px] text-subheading">
                <span className="text-[18px] font-bold text-heading">
                  ${c.hourly.usd}
                </span>
                <span className="text-[12px] text-subheading">/hr</span>
              </p>
              <Link href={`/m/carer/${c.id}`}>
                <Button size="md">See Profile</Button>
              </Link>
            </div>
          </Card>
        ))}

        {results.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-heading font-semibold">No carers found</p>
            <p className="mt-2 text-[13px] text-subheading">
              Try a different name, city, or service category.
            </p>
          </Card>
        )}
      </div>

      {filterOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end"
          onClick={() => setFilterOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-label="More filters"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-h-[85dvh] overflow-y-auto bg-white rounded-t-3xl px-5 pt-4 pb-6 shadow-card"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-heading">More filters</h2>
              <button
                onClick={() => setFilterOpen(false)}
                className="h-9 px-3 rounded-pill bg-muted text-subheading text-[13px] font-semibold"
              >
                Close
              </button>
            </div>

            <section className="mt-4">
              <p className="text-[12px] font-semibold text-subheading uppercase tracking-wide">
                Gender
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {GENDERS.map((g) => {
                  const on = genders.includes(g.key);
                  return (
                    <button
                      key={g.key}
                      onClick={() => toggleGender(g.key)}
                      className={`px-3 h-8 rounded-pill text-[12px] font-semibold ${
                        on
                          ? "bg-primary text-white"
                          : "bg-white text-subheading border border-line"
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-4">
              <p className="text-[12px] font-semibold text-subheading uppercase tracking-wide">
                Travel
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-[14px] text-heading">
                  <input
                    type="checkbox"
                    checked={needDriver}
                    onChange={(e) => setNeedDriver(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Has driver&rsquo;s licence
                </label>
                <label className="flex items-center gap-2 text-[14px] text-heading">
                  <input
                    type="checkbox"
                    checked={needVehicle}
                    onChange={(e) => setNeedVehicle(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Has own vehicle
                </label>
              </div>
            </section>

            <section className="mt-4">
              <p className="text-[12px] font-semibold text-subheading uppercase tracking-wide">
                Certifications
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CERTIFICATIONS.map((c) => {
                  const on = requiredCerts.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleCert(c.key)}
                      className={`px-3 h-8 rounded-pill text-[12px] font-semibold border ${
                        on
                          ? "bg-status-completed text-[#2C7A3F] border-[#A7D9B0]"
                          : "bg-white text-subheading border-line"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-4">
              <label className="block text-[12px] font-semibold text-subheading uppercase tracking-wide">
                Languages
              </label>
              <input
                value={requiredLangs}
                onChange={(e) => setRequiredLangs(e.target.value)}
                placeholder="Polish, Urdu"
                className="mt-2 w-full h-10 px-3 rounded-btn border border-line bg-white text-[14px] text-heading"
              />
            </section>

            <section className="mt-4">
              <label className="block text-[12px] font-semibold text-subheading uppercase tracking-wide">
                Carer tags
              </label>
              <input
                value={requiredTags}
                onChange={(e) => setRequiredTags(e.target.value)}
                placeholder="non-smoker, pet-friendly"
                className="mt-2 w-full h-10 px-3 rounded-btn border border-line bg-white text-[14px] text-heading"
              />
            </section>

            <div className="mt-6 flex items-center gap-2">
              <Button variant="outline" block onClick={clearExtras}>
                Clear
              </Button>
              <Button block onClick={() => setFilterOpen(false)}>
                Show {results.length} {results.length === 1 ? "carer" : "carers"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="home" role="seeker" />
    </main>
  );
}
