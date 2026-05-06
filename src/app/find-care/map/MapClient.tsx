"use client";

/**
 * Client-side Mapbox map for /find-care/map.
 *
 * Renders one pin per carer + a distinctive "you" pin at the origin and a
 * radius circle so the user can see what's being included. Click a pin →
 * mini popup card with name, rate, distance, and a "View profile" CTA.
 */

import { useEffect, useMemo, useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { formatMoney } from "@/lib/care/services";

type Marker = {
  user_id: string;
  display_name: string;
  headline: string | null;
  city: string | null;
  country: "GB" | "US";
  rating_avg: number | null;
  rating_count: number;
  services: string[];
  hourly_rate_cents: number | null;
  currency: "GBP" | "USD" | null;
  distance_m: number | null;
  lat: number;
  lng: number;
  instant_ready?: boolean;
};

type Props = {
  origin: { lat: number; lng: number };
  radiusKm: number;
  markers: Marker[];
  mapboxToken: string;
  mapStyle: string;
};

function distanceLabel(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return "";
  if (m < 1000) return `${Math.round(m)} m away`;
  const km = m / 1000;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

function rateLabel(m: Marker): string {
  if (!m.currency || m.hourly_rate_cents == null) return "Rate on request";
  return `${formatMoney(m.hourly_rate_cents, m.currency)}/hr`;
}

export default function FindCareMapClient({
  origin,
  radiusKm,
  markers,
  mapboxToken,
  mapStyle,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Re-render the map only when markers actually change identity.
  const markerKey = useMemo(
    () => markers.map((m) => m.user_id).join(","),
    [markers],
  );

  useEffect(() => {
    if (!mapboxToken || !containerRef.current) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = mapboxToken;

      // Pick zoom from radius: smaller radius = closer zoom.
      const zoomFromRadius = (km: number) => {
        if (km <= 5) return 12;
        if (km <= 10) return 11;
        if (km <= 20) return 10.2;
        if (km <= 30) return 9.6;
        return 9;
      };

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: mapStyle,
        center: [origin.lng, origin.lat],
        zoom: zoomFromRadius(radiusKm),
        attributionControl: true,
      });

      map.on("load", () => {
        // Radius circle (approximation via geojson polygon — good enough at this scale)
        const circle = makeCircleGeoJSON(origin.lat, origin.lng, radiusKm);
        map.addSource("radius", { type: "geojson", data: circle });
        map.addLayer({
          id: "radius-fill",
          type: "fill",
          source: "radius",
          paint: {
            "fill-color": "#039EA0",
            "fill-opacity": 0.08,
          },
        });
        map.addLayer({
          id: "radius-outline",
          type: "line",
          source: "radius",
          paint: {
            "line-color": "#039EA0",
            "line-width": 1.5,
            "line-dasharray": [2, 2],
          },
        });
      });

      // Origin marker (you)
      const youEl = document.createElement("div");
      youEl.style.cssText =
        "width:18px;height:18px;border-radius:50%;background:#171E54;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);";
      new mapboxgl.Marker({ element: youEl })
        .setLngLat([origin.lng, origin.lat])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(youPopup()))
        .addTo(map);

      // Carer markers
      for (const m of markers) {
        // Wrapper allows positioning a corner badge without rotating it.
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "position:relative;width:34px;height:34px;cursor:pointer;";

        const el = document.createElement("div");
        el.style.cssText = [
          "width:34px",
          "height:34px",
          "border-radius:50% 50% 50% 0",
          "transform:rotate(-45deg)",
          m.instant_ready ? "background:#FFB300" : "background:#039EA0",
          "border:3px solid #fff",
          "box-shadow:0 2px 4px rgba(0,0,0,0.25)",
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "color:#fff",
          "font-weight:600",
          "font-size:11px",
        ].join(";");
        const inner = document.createElement("span");
        inner.style.cssText = "transform:rotate(45deg);";
        inner.textContent = initials(m.display_name);
        el.appendChild(inner);
        wrap.appendChild(el);

        if (m.instant_ready) {
          const badge = document.createElement("div");
          badge.title = "Instant booking available";
          badge.style.cssText = [
            "position:absolute",
            "top:-6px",
            "right:-6px",
            "width:18px",
            "height:18px",
            "border-radius:50%",
            "background:#171E54",
            "color:#fff",
            "font-size:11px",
            "font-weight:700",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "border:2px solid #fff",
            "box-shadow:0 1px 2px rgba(0,0,0,0.25)",
            "line-height:1",
          ].join(";");
          badge.textContent = "⚡";
          wrap.appendChild(badge);
        }

        const popup = new mapboxgl.Popup({ offset: 24, maxWidth: "280px" })
          .setHTML(carerPopup(m));
        new mapboxgl.Marker({ element: wrap, anchor: "bottom" })
          .setLngLat([m.lng, m.lat])
          .setPopup(popup)
          .addTo(map);
      }

      cleanup = () => map.remove();
    })().catch((err) => {
      console.error("[find-care/map] init failed", err);
    });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
    // We intentionally rebuild the map when the markers, origin, or radius
    // change so popups + circle stay consistent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken, mapStyle, markerKey, origin.lat, origin.lng, radiusKm]);

  if (!mapboxToken) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 grid place-items-center text-center p-10 min-h-[400px]">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            Map not configured
          </p>
          <p className="text-xs text-slate-500 mt-1">
            The administrator hasn&apos;t added a map provider yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-2xl overflow-hidden border border-slate-200"
      style={{ height: "min(70vh, 640px)", minHeight: 400 }}
      aria-label="Map of nearby carers"
    />
  );
}

function youPopup(): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;padding:4px 2px;">
      <strong style="color:#171E54;font-size:13px;">You are here</strong>
      <div style="font-size:11px;color:#575757;margin-top:2px;">
        Showing carers within radius
      </div>
    </div>
  `;
}

function carerPopup(m: Marker): string {
  const country = m.country === "GB" ? "UK" : "US";
  const location = [m.city, country].filter(Boolean).join(", ");
  const rating =
    m.rating_count > 0 && m.rating_avg != null
      ? `★ ${m.rating_avg.toFixed(1)} (${m.rating_count})`
      : "New";
  const dist = distanceLabel(m.distance_m);
  const rate = rateLabel(m);
  const instantBadge = m.instant_ready
    ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:999px;background:#FFF4D6;color:#7A4F00;font-weight:700;font-size:10px;margin-left:6px;">⚡ Instant</span>`
    : "";
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;padding:6px 4px;min-width:220px;">
      <div style="font-weight:700;color:#171E54;font-size:14px;display:flex;align-items:center;flex-wrap:wrap;">
        <span>${escapeHtml(m.display_name)}</span>${instantBadge}
      </div>
      ${m.headline ? `<div style="font-size:12px;color:#575757;margin-top:2px;">${escapeHtml(m.headline)}</div>` : ""}
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:11px;color:#575757;flex-wrap:wrap;">
        <span>${escapeHtml(location)}</span>
        ${dist ? `<span style="color:#039EA0;font-weight:600;">${escapeHtml(dist)}</span>` : ""}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
        <span style="font-size:13px;font-weight:600;color:#171E54;">${escapeHtml(rate)}</span>
        <span style="font-size:11px;color:#575757;">${escapeHtml(rating)}</span>
      </div>
      <a href="/caregiver/${encodeURIComponent(m.user_id)}"
         style="display:block;text-align:center;margin-top:10px;padding:8px 12px;background:#039EA0;color:#fff;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">
        View profile
      </a>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Approximate a circle of `radiusKm` km around (lat,lng) as a 64-vertex
 * polygon. Good enough at city-scale zoom for a visual radius indicator;
 * this is not used for filtering (the DB does that with ST_DWithin).
 */
function makeCircleGeoJSON(
  lat: number,
  lng: number,
  radiusKm: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const points = 64;
  const coords: [number, number][] = [];
  const km = radiusKm;
  // 1 deg latitude ≈ 111 km; 1 deg longitude ≈ 111 km × cos(lat).
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= points; i++) {
    const t = (i * 2 * Math.PI) / points;
    coords.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}
