"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  COVERAGE_STATUS_LABEL,
  COVERAGE_VERTICAL_LABEL,
  flagFor,
  type CoverageCity,
  type CoverageStatus,
} from "@/lib/coverage-types";

type Bounds = "uk" | "us" | "all";

type Props = {
  cities: CoverageCity[];
  className?: string;
  height?: string;
  initialBounds?: Bounds;
};

const TEAL = "#039EA0";
const GREY = "#94A3B8";
const PIN_SIZE = 14;
const PIN_HOVER_SIZE = 18;

// Bounding boxes (sw, ne) used for fitBounds. Padding is added at fit time.
const UK_BOUNDS: [[number, number], [number, number]] = [
  [-9.0, 49.5],
  [2.5, 60.5],
];
const US_BOUNDS: [[number, number], [number, number]] = [
  [-125.5, 24.5],
  [-66.0, 49.5],
];
const ALL_BOUNDS: [[number, number], [number, number]] = [
  [-125.5, 24.5],
  [2.5, 60.5],
];

function pinFill(status: CoverageStatus): string {
  if (status === "live") return TEAL;
  if (status === "coming_soon") return GREY;
  return "transparent"; // waitlist
}

function pinBorder(status: CoverageStatus): string {
  if (status === "live") return "#FFFFFF";
  if (status === "waitlist") return TEAL;
  return "#FFFFFF";
}

function pinSize(status: CoverageStatus): number {
  return status === "coming_soon" ? 12 : PIN_SIZE;
}

/**
 * One pin DOM node. Built imperatively (vs JSX) because Mapbox expects
 * a raw HTMLElement to wrap into a Marker.
 */
function buildPinElement(
  city: CoverageCity,
  onSelect: (slug: string) => void,
  isSelected: () => boolean,
): HTMLButtonElement {
  const wrap = document.createElement("button");
  wrap.type = "button";
  wrap.setAttribute(
    "aria-label",
    `${city.name}, ${city.country} — ${COVERAGE_STATUS_LABEL[city.status]}`,
  );
  wrap.style.cursor = "pointer";
  wrap.style.background = "transparent";
  wrap.style.border = "0";
  wrap.style.padding = "0";

  const dot = document.createElement("span");
  const sz = pinSize(city.status);
  dot.style.display = "block";
  dot.style.width = `${sz}px`;
  dot.style.height = `${sz}px`;
  dot.style.borderRadius = "50%";
  dot.style.background = pinFill(city.status);
  dot.style.border = `2px solid ${pinBorder(city.status)}`;
  dot.style.boxShadow = "0 1px 2px rgba(15, 20, 22, 0.18)";
  dot.style.transition = "transform 120ms ease, box-shadow 120ms ease";
  wrap.appendChild(dot);

  function applyHoverState(active: boolean) {
    const grow = active ? PIN_HOVER_SIZE / sz : 1;
    dot.style.transform = `scale(${grow})`;
    dot.style.boxShadow = active
      ? "0 0 0 6px rgba(3, 158, 160, 0.18), 0 1px 2px rgba(15,20,22,0.18)"
      : "0 1px 2px rgba(15, 20, 22, 0.18)";
  }
  wrap.addEventListener("mouseenter", () => applyHoverState(true));
  wrap.addEventListener("mouseleave", () => applyHoverState(isSelected()));
  wrap.addEventListener("focus", () => applyHoverState(true));
  wrap.addEventListener("blur", () => applyHoverState(isSelected()));
  wrap.addEventListener("click", () => onSelect(city.slug));
  // Reflect initial selected state.
  applyHoverState(isSelected());

  // Stamp a data attribute so we can re-style externally if selection
  // changes from elsewhere (e.g. external filter clears selection).
  wrap.setAttribute("data-coverage-pin", city.slug);
  return wrap;
}

function popupHtml(city: CoverageCity): string {
  const verticalNames = city.verticals
    .map((v) => COVERAGE_VERTICAL_LABEL[v])
    .filter(Boolean);
  const verticalLine =
    verticalNames.length > 0
      ? `Care across ${verticalNames.join(", ")}.`
      : "";
  const liveLine =
    city.status === "live"
      ? `<p class="cv-popup-stats">${city.carer_count} carers · ${
          city.avg_response_min ?? "—"
        } min avg response</p>`
      : "";
  const flag = flagFor(city.country);
  const status = COVERAGE_STATUS_LABEL[city.status];
  const statusTone =
    city.status === "live"
      ? "cv-popup-status-live"
      : city.status === "waitlist"
        ? "cv-popup-status-waitlist"
        : "cv-popup-status-coming";
  return `
    <div role="dialog" aria-label="${city.name} availability" class="cv-popup">
      <p class="cv-popup-title">${flag} ${escapeHtml(city.name)}</p>
      <p class="cv-popup-status ${statusTone}">${status}</p>
      ${liveLine}
      <p class="cv-popup-verticals">${escapeHtml(verticalLine)}</p>
      <a href="/coverage/${city.slug}" class="cv-popup-link">Learn more →</a>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function CoverageMap({
  cities,
  className = "",
  height = "70vh",
  initialBounds = "all",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stub, setStub] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Stable list reference so the effect doesn't restart on each render
  // when the parent passes the same array.
  const citiesKey = useMemo(
    () => cities.map((c) => c.slug).join("|"),
    [cities],
  );

  useEffect(() => {
    let cancelled = false;
    let mapInstance: import("mapbox-gl").Map | null = null;
    let popupInstance: import("mapbox-gl").Popup | null = null;
    const markers: import("mapbox-gl").Marker[] = [];
    const pinEls = new Map<string, HTMLElement>();

    (async () => {
      const cfgRes = await fetch("/api/mapbox/config", {
        cache: "no-store",
      }).catch(() => null);
      if (!cfgRes || !cfgRes.ok) {
        if (!cancelled) setError("Map service unavailable.");
        return;
      }
      const cfg = (await cfgRes.json()) as {
        token: string | null;
        style: string;
        stub?: boolean;
      };
      if (!cfg.token || cfg.stub) {
        if (!cancelled) setStub(true);
        return;
      }

      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = cfg.token;

      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: cfg.style,
        bounds:
          initialBounds === "uk"
            ? UK_BOUNDS
            : initialBounds === "us"
              ? US_BOUNDS
              : ALL_BOUNDS,
        fitBoundsOptions: { padding: 48 },
        attributionControl: true,
        scrollZoom: !reduceMotion,
      });
      mapInstance = map;

      // Recover from the common case where the container has height 0
      // at mount time (e.g. component far below the fold, parent layout
      // not yet settled). Without this, mapbox-gl defaults the canvas to
      // ~300px and never repaints, leaving a blank teaser.
      const triggerResize = () => {
        try {
          map.resize();
        } catch {
          /* map may be torn down already */
        }
      };
      // One immediate retry on the next animation frame…
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(triggerResize);
        // …and a delayed one to catch late-hydrating CSS / font swaps.
        window.setTimeout(triggerResize, 400);
      }
      // Live-recover whenever the container itself changes size.
      let resizeObserver: ResizeObserver | null = null;
      if (
        typeof ResizeObserver !== "undefined" &&
        containerRef.current
      ) {
        resizeObserver = new ResizeObserver(triggerResize);
        resizeObserver.observe(containerRef.current);
      }
      resizeObserverRef.current = resizeObserver;

      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right",
      );

      // Build markers once the style is ready so the layer order is
      // settled.
      map.on("load", () => {
        for (const city of cities) {
          const el = buildPinElement(
            city,
            (slug) => {
              setSelectedSlug(slug);
              if (popupInstance) popupInstance.remove();
              popupInstance = new mapboxgl.Popup({
                offset: 14,
                closeButton: true,
                closeOnClick: true,
                maxWidth: "260px",
              })
                .setLngLat([city.lng, city.lat])
                .setHTML(popupHtml(city))
                .addTo(map);
              if (!reduceMotion) {
                map.flyTo({
                  center: [city.lng, city.lat],
                  zoom: Math.max(map.getZoom(), 6.5),
                  speed: 0.8,
                });
              }
            },
            () => selectedSlug === city.slug,
          );
          pinEls.set(city.slug, el);
          const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat([city.lng, city.lat])
            .addTo(map);
          markers.push(marker);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (popupInstance) popupInstance.remove();
      for (const m of markers) m.remove();
      if (mapInstance) mapInstance.remove();
    };
    // The map instance is rebuilt only when the city list itself
    // changes. initialBounds change does NOT rebuild — re-mount the
    // component if you want to re-fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citiesKey]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 ${className}`}
      style={{ height }}
    >
      {/* Stub fallback — render the city grid instead of a map. */}
      {stub ? (
        <div className="p-6 overflow-y-auto h-full">
          <p className="text-sm font-semibold text-slate-700">
            Map unavailable in this environment. Listing cities instead.
          </p>
          <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {cities.map((c) => (
              <li
                key={c.slug}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <Link
                  href={`/coverage/${c.slug}`}
                  className="font-semibold text-slate-900 hover:text-brand-700"
                >
                  {flagFor(c.country)} {c.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {COVERAGE_STATUS_LABEL[c.status]}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-rose-700">{error}</div>
      ) : (
        <div ref={containerRef} className="absolute inset-0" />
      )}

      {/* Tiny inline stylesheet for popups. Keeps everything self-contained. */}
      <style jsx global>{`
        .mapboxgl-popup-content.cv-popup,
        .cv-popup {
          font-family: var(
            --font-jakarta,
            "Plus Jakarta Sans",
            ui-sans-serif,
            system-ui,
            sans-serif
          );
        }
        .cv-popup .cv-popup-title {
          font-weight: 700;
          font-size: 15px;
          color: #0f1416;
          margin: 0 0 4px 0;
        }
        .cv-popup .cv-popup-status {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 9999px;
          margin: 0 0 6px 0;
        }
        .cv-popup .cv-popup-status-live {
          background: #e6faf9;
          color: #02787a;
        }
        .cv-popup .cv-popup-status-waitlist {
          background: #fef3c7;
          color: #92400e;
        }
        .cv-popup .cv-popup-status-coming {
          background: #f1f5f9;
          color: #334155;
        }
        .cv-popup .cv-popup-stats {
          font-size: 12px;
          color: #475569;
          margin: 0 0 4px 0;
        }
        .cv-popup .cv-popup-verticals {
          font-size: 12px;
          color: #475569;
          margin: 0 0 8px 0;
          line-height: 1.4;
        }
        .cv-popup .cv-popup-link {
          font-size: 13px;
          font-weight: 700;
          color: #02787a;
          text-decoration: none;
        }
        .cv-popup .cv-popup-link:hover {
          text-decoration: underline;
        }
        .mapboxgl-popup-content {
          padding: 12px 14px;
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(15, 20, 22, 0.12);
        }
      `}</style>
    </div>
  );
}
