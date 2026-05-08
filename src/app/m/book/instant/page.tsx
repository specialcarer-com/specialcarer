"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, BottomNav, Button, Card, Input, TopBar } from "../../_components/ui";

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

const START_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 60, label: "1 hr" },
  { value: 120, label: "2 hr" },
  { value: 240, label: "4 hr" },
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

export default function MobileInstantBookPage() {
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

  async function search() {
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
      date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      start: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      end: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      postcode: origin?.postcode ?? postcode.trim(),
      instant: "1",
    });
    router.push(`/book/${m.user_id}?${params.toString()}`);
  }

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Instant booking" back="/m/home" />

      <div className="px-4 py-4 space-y-4">
        <Card>
          <div className="space-y-4">
            <div>
              <p className="text-[14px] font-semibold text-heading flex items-center gap-1.5">
                <span aria-hidden>⚡</span> Find a carer for right now
              </p>
              <p className="mt-1 text-[12px] text-subheading">
                Tell us where, when and what — we&rsquo;ll find the nearest
                available carer.
              </p>
            </div>

            {/* Mode toggle: Quick match (this page) vs Browse & choose. */}
            <div
              role="tablist"
              aria-label="Booking mode"
              className="rounded-pill bg-muted p-1 grid grid-cols-2 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected="true"
                className="h-10 rounded-pill bg-white text-heading text-[13px] font-bold shadow-sm"
              >
                ⚡ Quick match
              </button>
              <Link
                role="tab"
                aria-selected="false"
                href="/m/book/browse"
                className="h-10 rounded-pill flex items-center justify-center text-subheading text-[13px] font-semibold"
              >
                Browse & choose
              </Link>
            </div>

            <Input
              label="Postcode"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="SW1A 1AA or 10001"
              autoComplete="postal-code"
            />

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
              {loading ? "Finding nearest…" : "Find a carer now"}
            </Button>
          </div>
        </Card>

        {matches && matches.length === 0 && (
          <Card>
            <p className="text-[14px] font-semibold text-heading text-center">
              No carers available right now in that area.
            </p>
            <p className="mt-1 text-[12px] text-subheading text-center">
              Try a longer notice or a different service.
            </p>
          </Card>
        )}

        {matches && matches.length > 0 && (
          <div className="space-y-3">
            {matches.map((m, idx) => (
              <Card key={m.user_id}>
                <div className="flex items-center gap-3">
                  <Avatar
                    src={m.photo_url ?? undefined}
                    name={m.display_name ?? "Carer"}
                    size={56}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[15px] font-bold text-heading truncate">
                        {m.display_name ?? "Carer"}
                      </p>
                      {idx === 0 && (
                        <span className="px-1.5 py-0.5 rounded-pill bg-primary-50 text-primary text-[10px] font-bold">
                          ⚡ Nearest
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-subheading">
                      {m.distance_km} km · ~{m.eta_minutes_estimate} min
                      {m.hourly_rate_cents != null && (
                        <>
                          {" · "}
                          {m.currency === "USD" ? "$" : "£"}
                          {(m.hourly_rate_cents / 100).toFixed(0)}/hr
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <Button
                    variant="primary"
                    size="md"
                    block
                    onClick={() => bookMatch(m)}
                  >
                    Book in 1 tap
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="home" role="seeker" />
    </main>
  );
}
