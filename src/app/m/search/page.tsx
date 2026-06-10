"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SERVICE_LABEL } from "../_lib/mock";
import { CERTIFICATIONS, GENDERS } from "@/lib/care/attributes";
import {
  classifyPostcode,
  inferCountryFromPostcode,
  normalisePostcode,
} from "@/lib/care/postcode";
import { rankCarers, type RerankCarer, type RerankSort } from "@/lib/match/rerank";

const TEAL = "#039EA0";

/**
 * Wire-format carer returned by GET /api/m/carers/search. Keep this in
 * sync with ApiSearchCarer in src/app/api/m/carers/search/search-handler.ts;
 * we redeclare here so the client component doesn't pull a server module.
 */
type ApiSearchCarer = {
  user_id: string;
  display_name: string | null;
  headline: string | null;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  services: string[];
  languages: string[];
  certifications: string[];
  tags: string[];
  care_formats: string[];
  gender: string | null;
  has_drivers_license: boolean;
  has_own_vehicle: boolean;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  hourly_rate_cents: number | null;
  weekly_rate_cents: number | null;
  currency: "GBP" | "USD";
  distance_km?: number | null;
  created_at?: string | null;
  is_online?: boolean | null;
  last_online_at?: string | null;
};

/** API ↔ page service key translation. The DB stores canonical vertical
 *  ids (childcare/elderly_care/special_needs/postnatal/complex_care) while
 *  this page uses the short keys from `_lib/mock` (child/elderly/...). */
const API_SERVICE: Record<string, string> = {
  child: "childcare",
  elderly: "elderly_care",
  special: "special_needs",
  postnatal: "postnatal",
  complex: "complex_care",
};
const SHORT_SERVICE: Record<string, "child" | "elderly" | "special" | "postnatal" | "complex"> = {
  childcare: "child",
  elderly_care: "elderly",
  special_needs: "special",
  postnatal: "postnatal",
  complex_care: "complex",
};

type PageCarer = {
  id: string;
  name: string;
  photo: string;
  city: string;
  rating: number;
  reviewCount: number;
  hourly: { gbp: number; usd: number };
  services: ("child" | "elderly" | "special" | "postnatal" | "complex")[];
  languages: string[];
  isClinical?: boolean;
  isNurse?: boolean;
  gender?: string;
  hasLicense?: boolean;
  hasVehicle?: boolean;
  certifications?: string[];
  tags?: string[];
  isOnline: boolean;
  lastOnlineAt: string | null;
  distanceKm: number | null;
  createdAt: string | null;
};

function adaptCarer(c: ApiSearchCarer): PageCarer {
  const dollars =
    c.hourly_rate_cents != null ? Math.round(c.hourly_rate_cents / 100) : 0;
  // The page renders USD; we surface the same number for both currency
  // codes since the DB stores a single rate and the design only shows one.
  const hourly =
    c.currency === "USD"
      ? { gbp: dollars, usd: dollars }
      : { gbp: dollars, usd: dollars };
  const tagsLower = (c.tags ?? []).map((t) => t.toLowerCase());
  const certsLower = (c.certifications ?? []).map((t) => t.toLowerCase());
  return {
    id: c.user_id,
    name: c.display_name ?? "Carer",
    photo: c.photo_url ?? "",
    city: c.city ?? "",
    rating: c.rating_avg ?? 0,
    reviewCount: c.rating_count,
    hourly,
    services: c.services
      .map((s) => SHORT_SERVICE[s])
      .filter((s): s is PageCarer["services"][number] => Boolean(s)),
    languages: c.languages,
    // No explicit clinical/nurse columns yet — infer from tags/certifications
    // so the existing filter chips and the CarerBadges component still
    // light up for carers who have advertised those credentials.
    isNurse:
      tagsLower.includes("nurse") ||
      certsLower.some((t) => t.includes("nurse") || t.includes("nmc") || t.includes(" rn")),
    isClinical:
      tagsLower.includes("clinical") ||
      certsLower.some((t) =>
        ["clinical", "peg", "care certificate", "rcn", "controlled drug"].some((kw) =>
          t.includes(kw),
        ),
      ),
    gender: c.gender ?? undefined,
    hasLicense: c.has_drivers_license,
    hasVehicle: c.has_own_vehicle,
    certifications: c.certifications,
    tags: c.tags,
    isOnline: c.is_online === true,
    lastOnlineAt: c.last_online_at ?? null,
    distanceKm: c.distance_km ?? null,
    createdAt: c.created_at ?? null,
  };
}

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

  // Smart rerank (gap 19): sort key + an "Online now" hard filter. The list
  // is reordered client-side with the shared match scorer; fresh-online carers
  // float to the top of every sort unless the user explicitly sorts elsewhere.
  const [sort, setSort] = useState<RerankSort>("best_match");
  const [onlineOnly, setOnlineOnly] = useState(false);

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

  // Server-fed carer list. Server applies the cheap filters (service, q,
  // base sort, paging); the page applies the rich filters (credentials,
  // languages, free-text tags, postcode-as-city proxy) on top so we stay
  // compatible with the existing UI without bloating the API surface.
  const [carers, setCarers] = useState<PageCarer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce free-text input so we don't fire a request per keystroke.
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(id);
  }, [q]);

  // Reflect API state in a ref so we can cancel a stale fetch when the
  // user changes filters mid-flight.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    const params = new URLSearchParams();
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (service !== "all") {
      const mapped = API_SERVICE[service];
      if (mapped) params.set("service", mapped);
    }
    params.set("limit", "50");

    setLoading(true);
    setError(null);
    fetch(`/api/m/carers/search?${params.toString()}`, {
      signal: ac.signal,
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { carers: ApiSearchCarer[] };
      })
      .then((data) => {
        setCarers((data.carers ?? []).map(adaptCarer));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Couldn't load carers — pull to retry.");
        setLoading(false);
      });

    return () => ac.abort();
  }, [debouncedQ, service]);

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
    return carers.filter((c) => {
      // Server already filtered by service. Belt-and-braces re-check in
      // case the adaptor mapping dropped an unrecognised vertical.
      if (service !== "all" && !c.services.includes(service as never)) return false;
      // Postcode acts as a soft city proxy until the API gains lat/lng
      // geosearch — same fallback the mock build used.
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
      if (genders.length > 0 && c.gender && !genders.includes(c.gender)) {
        return false;
      }
      if (needDriver && c.hasLicense === false) return false;
      if (needVehicle && c.hasVehicle === false) return false;
      if (requiredCerts.length > 0) {
        const have = new Set(c.certifications ?? []);
        if (!requiredCerts.every((k) => have.has(k))) return false;
      }
      if (reqLangs.length > 0) {
        const have = c.languages.map((l) => l.toLowerCase());
        if (!reqLangs.every((l) => have.includes(l))) return false;
      }
      if (reqTags.length > 0) {
        const have = (c.tags ?? []).map((t) => t.toLowerCase());
        if (!reqTags.every((t) => have.includes(t))) return false;
      }
      return true;
    });
  }, [
    carers,
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

  // Apply the "Online now" hard filter, then rerank with the shared scorer.
  // distance_km / created_at come from the search API (distance is null unless
  // the request carried an origin), so Nearest/Newest sorts are real now;
  // fresh-online carers still float to the top.
  const ranked = useMemo(() => {
    const pool = onlineOnly ? results.filter((c) => c.isOnline) : results;
    const ordered = rankCarers<RerankCarer & PageCarer>(
      pool.map((c) => ({
        ...c,
        rating: c.rating,
        rating_count: c.reviewCount,
        distance_km: c.distanceKm,
        is_online: c.isOnline,
        last_online_at: c.lastOnlineAt,
        created_at: c.createdAt,
      })),
      { sort, maxDistanceKm: radiusKm },
    );
    return ordered;
  }, [results, onlineOnly, sort, radiusKm]);

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

        {/* Online-now filter + sort (gap 19 smart rerank) */}
        <div className="-mx-4 px-4 flex items-center gap-2 overflow-x-auto pb-2 sc-no-select">
          <button
            onClick={() => setOnlineOnly((v) => !v)}
            aria-pressed={onlineOnly}
            className={`shrink-0 h-9 px-3 rounded-pill text-[13px] font-semibold transition inline-flex items-center gap-1.5 ${
              onlineOnly ? "text-white" : "bg-white text-subheading border border-line"
            }`}
            style={onlineOnly ? { background: TEAL } : undefined}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: onlineOnly ? "#fff" : TEAL }}
            />
            Online now
          </button>
          <div className="shrink-0 ml-auto flex items-center gap-1.5">
            <label htmlFor="carer-sort" className="text-[12px] text-subheading">
              Sort
            </label>
            <select
              id="carer-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as RerankSort)}
              aria-label="Sort carers"
              className="h-9 px-2 rounded-btn border border-line bg-white text-[13px] font-semibold text-heading"
            >
              <option value="best_match">Best match</option>
              <option value="rating_desc">Highest rated</option>
              <option value="nearest">Nearest</option>
              <option value="newest">Newest</option>
            </select>
          </div>
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
            {loading
              ? "Loading carers…"
              : `${ranked.length} ${ranked.length === 1 ? "carer" : "carers"} found`}
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
        {loading && carers.length === 0 && (
          <>
            {[0, 1, 2].map((i) => (
              <Card key={`sk-${i}`}>
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                  </div>
                </div>
                <div className="mt-4 h-3 w-1/2 rounded bg-muted animate-pulse" />
              </Card>
            ))}
          </>
        )}

        {error && !loading && (
          <Card className="text-center py-10">
            <p className="text-heading font-semibold">{error}</p>
          </Card>
        )}

        {!loading && ranked.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start gap-3">
              <Avatar src={c.photo} name={c.name} size={56} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[16px] font-bold text-heading truncate inline-flex items-center gap-1.5">
                    {c.isOnline && (
                      <span
                        aria-label="Online now"
                        title="Online now"
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: TEAL }}
                      />
                    )}
                    <span className="truncate">{c.name}</span>
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
              <Link href={`/m/carer/${c.id}?from=search`}>
                <Button size="md">See Profile</Button>
              </Link>
            </div>
          </Card>
        ))}

        {!loading && !error && ranked.length === 0 && (
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
                Show {ranked.length} {ranked.length === 1 ? "carer" : "carers"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="home" role="seeker" />
    </main>
  );
}
