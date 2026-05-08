"use client";

/**
 * Mode-2 "Browse & choose" carer discovery (mobile).
 *
 * Sister flow to /m/book/instant. Where Instant auto-picks the nearest
 * available carer, this page returns a ranked list and lets the seeker
 * pick. Tap a card → carer profile → Request booking CTA.
 *
 * Calls POST /api/browse-carers (see src/app/api/browse-carers/route.ts)
 * which reuses the find_instant_match RPC for eligibility, then ranks
 * the survivors by a composite smart-score (distance + rating +
 * experience + verification + recency).
 *
 * Per the May-9 product spec: the screen exposes the most common filters
 * inline (postcode, service, max distance, min rating) and tucks the rest
 * (gender, vehicle, certifications, languages, max rate) behind a
 * "More filters" bottom sheet — the same pattern as /m/search.
 */

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
} from "../../_components/ui";
import { CERTIFICATIONS, GENDERS } from "@/lib/care/attributes";

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
  { value: "postnatal", label: "Postnatal" },
  { value: "complex_care", label: "Complex care" },
];

const DURATION_OPTIONS = [
  { value: 1, label: "1 hr" },
  { value: 2, label: "2 hr" },
  { value: 4, label: "4 hr" },
  { value: 6, label: "6 hr" },
  { value: 8, label: "8 hr" },
];

const START_OPTIONS = [
  { value: 60, label: "1 hr" },
  { value: 240, label: "4 hr" },
  { value: 1440, label: "Tomorrow" },
];

/** Mirrors BrowseCarerCard from /api/browse-carers/route.ts */
type BrowseCard = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  photo_url: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  bio: string | null;
  years_experience: number | null;
  hourly_rate_cents: number | null;
  currency: string | null;
  distance_m: number;
  distance_km: number;
  eta_minutes_estimate: number;
  is_background_checked: boolean;
  languages: string[];
  certifications: string[];
  tags: string[];
  gender: string | null;
  has_drivers_license: boolean;
  has_own_vehicle: boolean;
  score: number;
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function fmtRate(cents: number, currency: string | null): string {
  const sym = currency === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(0)}`;
}

export default function MobileBrowseCarersPage() {
  // Search inputs
  const [postcode, setPostcode] = useState("");
  const [service, setService] = useState<ServiceType>("elderly_care");
  const [startInMinutes, setStartInMinutes] = useState<number>(60);
  const [durationHours, setDurationHours] = useState<number>(2);

  // Inline filters
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(25);
  const [minRating, setMinRating] = useState<number>(0);

  // More-filters sheet
  const [filterOpen, setFilterOpen] = useState(false);
  const [genders, setGenders] = useState<string[]>([]);
  const [needDriver, setNeedDriver] = useState(false);
  const [needVehicle, setNeedVehicle] = useState(false);
  const [needBgCheck, setNeedBgCheck] = useState(false);
  const [requiredCerts, setRequiredCerts] = useState<string[]>([]);
  const [requiredLangs, setRequiredLangs] = useState<string>("");
  const [maxRateInput, setMaxRateInput] = useState<string>("");

  // Result state
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cards, setCards] = useState<BrowseCard[] | null>(null);
  const [searchedAt, setSearchedAt] = useState<{ start: Date; end: Date } | null>(
    null,
  );

  const inflightRef = useRef<AbortController | null>(null);

  function makeTimes() {
    const start = new Date(Date.now() + startInMinutes * 60_000);
    const end = new Date(start.getTime() + durationHours * 60 * 60_000);
    return { start, end };
  }

  function toggleGender(k: string) {
    setGenders((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }
  function toggleCert(k: string) {
    setRequiredCerts((p) =>
      p.includes(k) ? p.filter((x) => x !== k) : [...p, k],
    );
  }
  function clearExtras() {
    setGenders([]);
    setNeedDriver(false);
    setNeedVehicle(false);
    setNeedBgCheck(false);
    setRequiredCerts([]);
    setRequiredLangs("");
    setMaxRateInput("");
  }

  const activeExtraCount =
    genders.length +
    requiredCerts.length +
    (needDriver ? 1 : 0) +
    (needVehicle ? 1 : 0) +
    (needBgCheck ? 1 : 0) +
    requiredLangs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean).length +
    (maxRateInput.trim().length > 0 ? 1 : 0);

  async function search() {
    setErr(null);
    setCards(null);
    if (!postcode.trim()) {
      setErr("Please enter a postcode.");
      return;
    }

    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;
    setLoading(true);

    try {
      const { start, end } = makeTimes();
      setSearchedAt({ start, end });

      const langs = requiredLangs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const maxRateCents =
        maxRateInput.trim().length > 0 && !Number.isNaN(Number(maxRateInput))
          ? Math.round(Number(maxRateInput) * 100)
          : undefined;

      const body: Record<string, unknown> = {
        postcode: postcode.trim(),
        service_type: service,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        max_results: 25,
        max_distance_km: maxDistanceKm,
      };
      if (minRating > 0) body.min_rating = minRating;
      if (maxRateCents != null) body.max_hourly_rate_cents = maxRateCents;
      if (langs.length > 0) body.languages = langs;
      if (requiredCerts.length > 0) body.certifications = requiredCerts;
      if (genders.length > 0) body.genders = genders;
      if (needDriver) body.requires_drivers_license = true;
      if (needVehicle) body.requires_vehicle = true;
      if (needBgCheck) body.requires_background_check = true;

      const res = await fetch("/api/browse-carers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        carers?: BrowseCard[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setCards(json.carers ?? []);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }

  // Re-run on inline-filter change after the first search.
  useEffect(() => {
    if (cards == null) return;
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDistanceKm, minRating]);

  function carerHref(id: string): string {
    if (!searchedAt) return `/m/carer/${id}`;
    const { start, end } = searchedAt;
    const params = new URLSearchParams({
      service,
      date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      start: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      end: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      postcode: postcode.trim(),
    });
    return `/m/carer/${id}?${params.toString()}`;
  }

  const resultCount = cards?.length ?? 0;

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Browse carers" back="/m/book" />

      <div className="px-4 py-4 space-y-4">
        <Card>
          <div className="space-y-4">
            <div>
              <p className="text-[14px] font-semibold text-heading flex items-center gap-1.5">
                <IconSearch /> Pick the carer that fits
              </p>
              <p className="mt-1 text-[12px] text-subheading">
                We&rsquo;ll rank nearby carers by distance, rating and
                experience. Tap a profile to send a booking request.
              </p>
              <p className="mt-2 text-[11px] text-subheading">
                Want the fastest option instead?{" "}
                <Link
                  href="/m/book/instant"
                  className="font-semibold text-primary"
                >
                  Quick match instead
                </Link>
              </p>
            </div>

            <div>
              <label
                htmlFor="bc-postcode"
                className="block text-[14px] font-semibold text-heading mb-2"
              >
                Postcode
              </label>
              <input
                id="bc-postcode"
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="SW1A 1AA or 10001"
                autoComplete="postal-code"
                className="w-full h-14 rounded-btn border border-line bg-white px-4 text-[15px] text-heading placeholder:text-[#A3A3A3] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <p className="text-[14px] font-semibold text-heading mb-2">
                Service
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SERVICES.map((s) => {
                  const on = service === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setService(s.value)}
                      className={`text-left px-3 py-2.5 rounded-btn border text-[13px] sc-no-select transition ${
                        on
                          ? "bg-primary-50 border-primary text-primary font-bold"
                          : "bg-white border-line text-heading"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[14px] font-semibold text-heading mb-2">
                Start when?
              </p>
              <div className="flex flex-wrap gap-2">
                {START_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setStartInMinutes(o.value)}
                    className={`px-3 py-1.5 rounded-pill border text-[13px] sc-no-select transition ${
                      startInMinutes === o.value
                        ? "bg-primary-50 border-primary text-primary font-bold"
                        : "bg-white border-line text-heading"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[14px] font-semibold text-heading mb-2">
                Duration
              </p>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setDurationHours(o.value)}
                    className={`px-3 py-1.5 rounded-pill border text-[13px] sc-no-select transition ${
                      durationHours === o.value
                        ? "bg-primary-50 border-primary text-primary font-bold"
                        : "bg-white border-line text-heading"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {err && (
              <p className="text-[13px] text-[#C22] bg-[#FBEBEB] rounded-btn px-3 py-2">
                {err}
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              block
              onClick={search}
              disabled={loading}
            >
              {loading ? "Finding carers…" : "Show me available carers"}
            </Button>
          </div>
        </Card>

        {cards != null && (
          <>
            {/* Inline filters strip — shown once a search has run */}
            <div className="flex items-center gap-2 overflow-x-auto sc-no-scrollbar -mx-1 px-1">
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-white border border-line text-[12px] font-semibold text-heading"
              >
                <IconFilter />
                More filters
                {activeExtraCount > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold px-1.5">
                    {activeExtraCount}
                  </span>
                )}
              </button>

              <div className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-white border border-line">
                <label
                  htmlFor="bc-distance"
                  className="text-[12px] font-semibold text-subheading"
                >
                  Within
                </label>
                <select
                  id="bc-distance"
                  value={maxDistanceKm}
                  onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
                  className="text-[12px] font-bold text-heading bg-transparent outline-none"
                >
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={15}>15 km</option>
                  <option value={25}>25 km</option>
                </select>
              </div>

              <div className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-white border border-line">
                <label
                  htmlFor="bc-rating"
                  className="text-[12px] font-semibold text-subheading"
                >
                  Min rating
                </label>
                <select
                  id="bc-rating"
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="text-[12px] font-bold text-heading bg-transparent outline-none"
                >
                  <option value={0}>Any</option>
                  <option value={3}>3+</option>
                  <option value={4}>4+</option>
                  <option value={4.5}>4.5+</option>
                </select>
              </div>
            </div>

            <p className="text-[12px] text-subheading">
              {loading
                ? "Updating…"
                : `${resultCount} ${resultCount === 1 ? "carer" : "carers"} ranked for you`}
            </p>
          </>
        )}

        {cards != null && cards.length === 0 && !loading && (
          <Card>
            <p className="text-[14px] font-semibold text-heading text-center">
              No carers match your filters.
            </p>
            <p className="mt-1 text-[12px] text-subheading text-center">
              Try widening the distance or removing some filters.
            </p>
          </Card>
        )}

        {cards != null && cards.length > 0 && (
          <div className="space-y-3">
            {cards.map((c, idx) => (
              <Link
                key={c.user_id}
                href={carerHref(c.user_id)}
                className="block"
              >
                <Card>
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={c.photo_url ?? undefined}
                      name={c.display_name ?? "Carer"}
                      size={56}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[16px] font-bold text-heading truncate">
                            {c.display_name ?? "Carer"}
                          </p>
                          {c.city && (
                            <p className="mt-0.5 text-[12px] text-subheading inline-flex items-center gap-1">
                              <IconPin /> {c.city}
                            </p>
                          )}
                        </div>
                        {c.rating_avg != null && c.rating_count != null && c.rating_count > 0 ? (
                          <span className="flex items-center gap-1 text-[13px] font-bold text-heading shrink-0">
                            {c.rating_avg.toFixed(1)} <IconStar />
                            <span className="text-[11px] font-medium text-subheading">
                              ({c.rating_count})
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-subheading shrink-0">
                            New
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {idx === 0 && (
                          <span className="px-1.5 py-0.5 rounded-pill bg-primary-50 text-primary text-[10px] font-bold">
                            ✨ Top pick
                          </span>
                        )}
                        {c.is_background_checked && (
                          <CarerBadges isClinical={false} isNurse={false} compact />
                        )}
                        {c.years_experience != null && c.years_experience > 0 && (
                          <Tag tone="primary">
                            {c.years_experience}y experience
                          </Tag>
                        )}
                      </div>
                    </div>
                  </div>

                  {c.bio && (
                    <p className="mt-3 text-[13px] text-heading leading-relaxed line-clamp-2">
                      {c.bio}
                    </p>
                  )}

                  <div className="border-t border-line mt-4 pt-3 flex items-center justify-between">
                    <div className="text-[12px] text-subheading">
                      {c.distance_km} km
                      {c.hourly_rate_cents != null && (
                        <>
                          {" · "}
                          <span className="text-[16px] font-bold text-heading">
                            {fmtRate(c.hourly_rate_cents, c.currency)}
                          </span>
                          <span>/hr</span>
                        </>
                      )}
                    </div>
                    <Button size="md">View profile</Button>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {filterOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end"
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
                Travel & verification
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
                <label className="flex items-center gap-2 text-[14px] text-heading">
                  <input
                    type="checkbox"
                    checked={needBgCheck}
                    onChange={(e) => setNeedBgCheck(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Background-checked only
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
              <label
                htmlFor="bc-langs"
                className="block text-[12px] font-semibold text-subheading uppercase tracking-wide"
              >
                Languages
              </label>
              <input
                id="bc-langs"
                value={requiredLangs}
                onChange={(e) => setRequiredLangs(e.target.value)}
                placeholder="Polish, Urdu"
                className="mt-2 w-full h-10 px-3 rounded-btn border border-line bg-white text-[14px] text-heading"
              />
            </section>

            <section className="mt-4">
              <label
                htmlFor="bc-rate"
                className="block text-[12px] font-semibold text-subheading uppercase tracking-wide"
              >
                Max hourly rate
              </label>
              <input
                id="bc-rate"
                inputMode="decimal"
                value={maxRateInput}
                onChange={(e) => setMaxRateInput(e.target.value)}
                placeholder="e.g. 25"
                className="mt-2 w-full h-10 px-3 rounded-btn border border-line bg-white text-[14px] text-heading"
              />
            </section>

            <div className="mt-6 flex items-center gap-2">
              <Button variant="outline" block onClick={clearExtras}>
                Clear
              </Button>
              <Button
                block
                onClick={() => {
                  setFilterOpen(false);
                  void search();
                }}
              >
                Apply filters
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="home" role="seeker" />
    </main>
  );
}
