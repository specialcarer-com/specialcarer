"use client";

/**
 * Carer-side job discovery feed.
 *
 * Two kinds of items render in one combined list/map:
 *   • targeted_booking — a seeker booked this carer specifically; pending
 *     ones can be accepted (with countdown) or declined.
 *   • open_request — anyone-can-claim board, anonymized client name.
 *
 * Design language follows the existing /m/* shell: TopBar, BottomNav,
 * search input, filter chips, Card-like rows. Map view is a thin
 * wrapper around mapbox-gl with a bottom-sheet preview.
 */

import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  BottomNav,
  Button,
  Card,
  IconClock,
  IconFilter,
  IconPin,
  IconSearch,
  Tag,
  TopBar,
} from "../_components/ui";
import { serviceLabel } from "@/lib/care/services";

// ── Types matching /api/m/jobs ───────────────────────────────────
type Currency = string;

type ItemBase = {
  id: string;
  client_first_name: string;
  client_avatar_initial: string;
  distance_km: number | null;
  service_type: string;
  hours: number;
  hourly_rate_cents: number;
  currency: Currency;
  starts_at: string;
  ends_at: string;
  location_city: string | null;
  location_country: string | null;
  service_point_lng: number | null;
  service_point_lat: number | null;
  surge: boolean;
};

type TargetedItem = ItemBase & {
  kind: "targeted_booking";
  status: string;
  expires_at: string | null;
  is_preferred_client: boolean;
  location_postcode_partial: string | null;
};

type OpenItem = ItemBase & {
  kind: "open_request";
  expires_at: string;
};

type JobItem = TargetedItem | OpenItem;

type SavedSearch = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
};

const VERTICALS = [
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
] as const;

type Vertical = (typeof VERTICALS)[number];

type Filters = {
  service_type: Vertical | null;
  radius_km: number;
  min_rate_cents: number | null;
  min_hours: number | null;
  max_hours: number | null;
  preferred_only: boolean;
};

const DEFAULT_FILTERS: Filters = {
  service_type: null,
  radius_km: 25,
  min_rate_cents: null,
  min_hours: null,
  max_hours: null,
  preferred_only: false,
};

function fmtRate(cents: number, currency: Currency): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(0)}/hr`;
}

function fmtStart(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildQs(filters: Filters): string {
  const qs = new URLSearchParams();
  if (filters.service_type) qs.set("service_type", filters.service_type);
  qs.set("radius_km", String(filters.radius_km));
  if (filters.min_rate_cents != null && filters.min_rate_cents > 0)
    qs.set("min_rate_cents", String(filters.min_rate_cents));
  if (filters.min_hours != null && filters.min_hours > 0)
    qs.set("min_hours", String(filters.min_hours));
  if (filters.max_hours != null && filters.max_hours > 0)
    qs.set("max_hours", String(filters.max_hours));
  if (filters.preferred_only) qs.set("preferred_only", "true");
  return qs.toString();
}

export default function JobsFeedClient({
  mapboxToken,
  mapStyle,
}: {
  mapboxToken: string;
  mapStyle: string;
}) {
  const [view, setView] = useState<"list" | "map">("list");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  // Tick once a second so countdowns update without per-card timers.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/m/jobs?${buildQs(filters)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Couldn't load jobs.");
      }
      const json = (await res.json()) as { items?: JobItem[] };
      setItems(json.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  // Saved searches load once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/saved-searches", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { searches?: SavedSearch[] };
        if (!cancelled) setSavedSearches(json.searches ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const needle = q.trim().toLowerCase();
    return items.filter((j) => {
      const hay = `${j.client_first_name} ${j.location_city ?? ""} ${serviceLabel(j.service_type)}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  function applySaved(s: SavedSearch) {
    const f = s.filters as Partial<Filters>;
    setFilters({ ...DEFAULT_FILTERS, ...f });
  }

  async function deleteSaved(s: SavedSearch) {
    if (!confirm(`Delete "${s.name}"?`)) return;
    try {
      const res = await fetch(`/api/m/saved-searches?id=${s.id}`, {
        method: "DELETE",
      });
      if (res.ok) setSavedSearches((rows) => rows.filter((r) => r.id !== s.id));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Jobs near you" />

      <div className="px-5 pt-2">
        <label className="flex h-12 items-center gap-3 rounded-2xl bg-muted px-4">
          <IconSearch />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs"
            className="flex-1 bg-transparent text-[15px] text-heading placeholder:text-subheading focus:outline-none"
          />
        </label>
      </div>

      {/* View toggle + filter */}
      <div className="px-5 pt-3 flex items-center gap-2">
        <div className="rounded-pill bg-muted p-1 grid grid-cols-2 gap-1 flex-1">
          {(["list", "map"] as const).map((v) => {
            const on = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`h-9 rounded-pill text-[13px] font-semibold transition ${
                  on ? "bg-white text-heading shadow-sm" : "text-subheading"
                }`}
              >
                {v === "list" ? "List" : "Map"}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label="Filters"
          className="grid h-10 w-10 place-items-center rounded-pill bg-white shadow-card text-heading"
        >
          <IconFilter />
        </button>
      </div>

      {/* Saved searches chip row */}
      {savedSearches.length > 0 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {savedSearches.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => applySaved(s)}
              onContextMenu={(e) => {
                e.preventDefault();
                void deleteSaved(s);
              }}
              className="shrink-0 rounded-pill px-4 py-2 text-sm font-semibold bg-white text-heading shadow-card"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Service-type quick-filter chips (mirrors the existing chip row design). */}
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, service_type: null }))}
          className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold transition ${
            filters.service_type == null
              ? "bg-primary text-white"
              : "bg-white text-subheading shadow-card"
          }`}
        >
          All
        </button>
        {VERTICALS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, service_type: v }))}
            className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold transition ${
              filters.service_type === v
                ? "bg-primary text-white"
                : "bg-white text-subheading shadow-card"
            }`}
          >
            {serviceLabel(v)}
          </button>
        ))}
      </div>

      {view === "list" ? (
        <ListView
          items={filtered}
          loading={loading}
          err={err}
          onRetry={() => void fetchItems()}
        />
      ) : (
        <MapView
          items={filtered}
          mapboxToken={mapboxToken}
          mapStyle={mapStyle}
        />
      )}

      {filterOpen && (
        <FilterSheet
          filters={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(next) => {
            setFilters(next);
            setFilterOpen(false);
          }}
          onSave={async (name, payload) => {
            try {
              const res = await fetch("/api/m/saved-searches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, filters: payload }),
              });
              if (res.ok) {
                const json = (await res.json()) as { search?: SavedSearch };
                if (json.search)
                  setSavedSearches((rows) => [json.search!, ...rows]);
              }
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      <BottomNav active="jobs" role="carer" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// List view + cards
// ────────────────────────────────────────────────────────────────────

function ListView({
  items,
  loading,
  err,
  onRetry,
}: {
  items: JobItem[];
  loading: boolean;
  err: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="px-5 pt-6 text-center text-subheading text-sm">
        Loading nearby jobs…
      </div>
    );
  }
  if (err) {
    return (
      <div className="px-5 pt-6 text-center">
        <p className="text-sm text-rose-700">{err}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-semibold text-primary"
        >
          Try again
        </button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="px-5 pt-8 text-center">
        <p className="text-sm text-subheading">
          No jobs match your filters yet. Tweak the radius or service type, or
          check back later.
        </p>
      </div>
    );
  }
  return (
    <ul className="mt-3 flex flex-col gap-3 px-5 pb-6">
      {items.map((j) => (
        <li key={`${j.kind}:${j.id}`}>
          <JobCard item={j} />
        </li>
      ))}
    </ul>
  );
}

function JobCard({ item }: { item: JobItem }) {
  const targeted = item.kind === "targeted_booking";
  const href = targeted ? `/m/jobs/${item.id}` : `/m/jobs/open/${item.id}`;
  const distance =
    item.distance_km != null ? `${item.distance_km.toFixed(1)} km` : null;
  const expiresAt =
    targeted ? (item as TargetedItem).expires_at : (item as OpenItem).expires_at;
  const status = targeted ? (item as TargetedItem).status : "open";
  const showCountdown =
    expiresAt && (targeted ? status === "pending" : true);

  return (
    <Link href={href} className="block">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Avatar name={item.client_avatar_initial} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[15px] font-bold text-heading truncate">
                {item.client_first_name}
              </p>
              <Tag tone={targeted ? "primary" : "neutral"}>
                {targeted ? "Sent to you" : "Open request"}
              </Tag>
              {item.surge && <Tag tone="amber">Surge</Tag>}
              {targeted && (item as TargetedItem).is_preferred_client && (
                <Tag tone="green">Preferred</Tag>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-subheading">
              {serviceLabel(item.service_type)} · {item.hours} hr ·{" "}
              <span className="font-semibold text-heading">
                {fmtRate(item.hourly_rate_cents, item.currency)}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-subhead inline-flex items-center gap-1">
              <IconClock /> {fmtStart(item.starts_at)}
              {distance && (
                <>
                  {" · "}
                  <IconPin /> {distance}
                </>
              )}
            </p>
            {item.location_city && (
              <p className="mt-1 text-[12px] text-subheading">
                {item.location_city}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          {targeted ? (
            <Tag tone={status === "pending" ? "amber" : "primary"}>
              {status === "pending" ? "Pending" : status}
            </Tag>
          ) : (
            <span className="text-[12px] text-subheading">Tap to claim</span>
          )}
          {showCountdown && expiresAt && (
            <Countdown isoExpiresAt={expiresAt} />
          )}
        </div>
      </Card>
    </Link>
  );
}

function Countdown({ isoExpiresAt }: { isoExpiresAt: string }) {
  const ms = new Date(isoExpiresAt).getTime() - Date.now();
  if (ms <= 0) return <Tag tone="red">Expired</Tag>;
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return (
      <Tag tone="neutral">
        {h}h {mm}m
      </Tag>
    );
  }
  const text = `${m}:${String(s).padStart(2, "0")}`;
  return <Tag tone={m < 2 ? "red" : "neutral"}>{text}</Tag>;
}

// ────────────────────────────────────────────────────────────────────
// Map view
// ────────────────────────────────────────────────────────────────────

function MapView({
  items,
  mapboxToken,
  mapStyle,
}: {
  items: JobItem[];
  mapboxToken: string;
  mapStyle: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  type Handle = {
    map: import("mapbox-gl").Map;
    markers: import("mapbox-gl").Marker[];
  };
  const handleRef = useRef<Handle | null>(null);
  const [selected, setSelected] = useState<JobItem | null>(null);

  // Pins we know how to plot (have coords).
  const plotted = useMemo(
    () =>
      items.filter(
        (i) =>
          typeof i.service_point_lng === "number" &&
          typeof i.service_point_lat === "number",
      ),
    [items],
  );

  useEffect(() => {
    if (!mapboxToken || !containerRef.current) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = mapboxToken;
      const center: [number, number] =
        plotted.length > 0
          ? [plotted[0].service_point_lng!, plotted[0].service_point_lat!]
          : [-0.1276, 51.5074];
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: mapStyle,
        center,
        zoom: plotted.length > 0 ? 11 : 9,
      });
      const markers: import("mapbox-gl").Marker[] = [];
      handleRef.current = { map, markers };
      cleanup = () => {
        markers.forEach((m) => m.remove());
        map.remove();
      };
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken, mapStyle]);

  // Sync markers when items change.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.markers.forEach((m) => m.remove());
    handle.markers = [];
    void (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      const fresh = handleRef.current;
      if (!fresh) return;
      for (const it of plotted) {
        const el = document.createElement("button");
        el.type = "button";
        el.style.cssText = `width:28px;height:28px;border-radius:50%;border:2px solid #fff;background:${
          it.kind === "targeted_booking" ? "#039EA0" : "#171E54"
        };box-shadow:0 1px 3px rgba(0,0,0,0.25);cursor:pointer;`;
        el.addEventListener("click", () => setSelected(it));
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([it.service_point_lng!, it.service_point_lat!])
          .addTo(fresh.map);
        fresh.markers.push(marker);
      }
      if (plotted.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        plotted.forEach((p) =>
          bounds.extend([p.service_point_lng!, p.service_point_lat!] as [
            number,
            number,
          ]),
        );
        fresh.map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
      }
    })();
  }, [plotted]);

  return (
    <div className="mt-3 px-5 pb-6">
      <div
        className="relative rounded-2xl overflow-hidden bg-slate-100 border border-line"
        style={{ height: "60vh", minHeight: 360 }}
      >
        <div ref={containerRef} className="w-full h-full" />
        {!mapboxToken && (
          <div className="absolute inset-0 grid place-items-center bg-slate-100 text-center px-6">
            <p className="text-[14px] text-subheading">
              Map not configured.
            </p>
          </div>
        )}
        {selected && (
          <div className="absolute inset-x-3 bottom-3">
            <JobCard item={selected} />
          </div>
        )}
      </div>
      {plotted.length === 0 && (
        <p className="mt-3 text-center text-[12px] text-subheading">
          No jobs with mapped locations match your filters.
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Filter sheet
// ────────────────────────────────────────────────────────────────────

function FilterSheet({
  filters,
  onClose,
  onApply,
  onSave,
}: {
  filters: Filters;
  onClose: () => void;
  onApply: (next: Filters) => void;
  onSave: (name: string, payload: Filters) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Filters>(filters);
  const [savingName, setSavingName] = useState("");
  const [savingBusy, setSavingBusy] = useState(false);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 grid items-end"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[18px] font-bold text-heading">Filters</h3>

        <FilterField label="Service type">
          <div className="flex flex-wrap gap-2">
            <ChipBtn
              on={draft.service_type == null}
              onClick={() => setDraft({ ...draft, service_type: null })}
              label="All"
            />
            {VERTICALS.map((v) => (
              <ChipBtn
                key={v}
                on={draft.service_type === v}
                onClick={() => setDraft({ ...draft, service_type: v })}
                label={serviceLabel(v)}
              />
            ))}
          </div>
        </FilterField>

        <FilterField
          label={`Distance: ${draft.radius_km} km`}
          help="Shifts within this radius of your home location."
        >
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={draft.radius_km}
            onChange={(e) =>
              setDraft({ ...draft, radius_km: Number(e.target.value) })
            }
            className="w-full"
          />
        </FilterField>

        <FilterField
          label={`Min hourly rate: ${
            draft.min_rate_cents != null && draft.min_rate_cents > 0
              ? `£${(draft.min_rate_cents / 100).toFixed(0)}`
              : "any"
          }`}
        >
          <input
            type="range"
            min={0}
            max={5000}
            step={100}
            value={draft.min_rate_cents ?? 0}
            onChange={(e) =>
              setDraft({
                ...draft,
                min_rate_cents: Number(e.target.value) || null,
              })
            }
            className="w-full"
          />
        </FilterField>

        <div className="grid grid-cols-2 gap-3">
          <FilterField label="Min hours">
            <input
              type="number"
              min={0}
              max={24}
              value={draft.min_hours ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  min_hours: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-line"
            />
          </FilterField>
          <FilterField label="Max hours">
            <input
              type="number"
              min={0}
              max={24}
              value={draft.max_hours ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  max_hours: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-line"
            />
          </FilterField>
        </div>

        <label className="mt-4 flex items-center gap-3">
          <input
            type="checkbox"
            checked={draft.preferred_only}
            onChange={(e) =>
              setDraft({ ...draft, preferred_only: e.target.checked })
            }
          />
          <span className="text-[14px] text-heading">
            Preferred clients only
          </span>
        </label>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onApply(draft)}>Apply</Button>
        </div>

        <div className="mt-6 pt-5 border-t border-line">
          <p className="text-[13px] font-semibold text-heading">
            Save these filters
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              placeholder="e.g. Weekday childcare"
              className="flex-1 px-3 py-2 rounded-xl border border-line text-[14px]"
            />
            <button
              type="button"
              disabled={!savingName.trim() || savingBusy}
              onClick={async () => {
                if (!savingName.trim()) return;
                setSavingBusy(true);
                await onSave(savingName.trim(), draft);
                setSavingBusy(false);
                setSavingName("");
              }}
              className="px-4 py-2 rounded-xl bg-secondary text-white text-[14px] font-semibold disabled:opacity-50"
            >
              {savingBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="text-[13px] font-semibold text-heading mb-1">{label}</p>
      {help && <p className="text-[11px] text-subheading mb-2">{help}</p>}
      {children}
    </div>
  );
}

function ChipBtn({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-pill text-[13px] font-semibold border transition ${
        on
          ? "bg-slate-900 border-slate-900 text-white"
          : "bg-white border-line text-heading"
      }`}
    >
      {label}
    </button>
  );
}
