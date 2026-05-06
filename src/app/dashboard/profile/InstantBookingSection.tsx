"use client";

import { useEffect, useState } from "react";

type InstantSettings = {
  enabled: boolean;
  min_notice_minutes: number;
  instant_radius_km: number | null;
  auto_decline_minutes: number;
};

const DEFAULTS: InstantSettings = {
  enabled: false,
  min_notice_minutes: 60,
  instant_radius_km: null,
  auto_decline_minutes: 5,
};

const NOTICE_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hr" },
  { value: 120, label: "2 hr" },
  { value: 240, label: "4 hr" },
  { value: 1440, label: "24 hr" },
];

const AUTO_DECLINE_OPTIONS = [
  { value: 2, label: "2 min" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
];

export default function InstantBookingSection() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(DEFAULTS.enabled);
  const [minNotice, setMinNotice] = useState<number>(DEFAULTS.min_notice_minutes);
  const [useCustomRadius, setUseCustomRadius] = useState(false);
  const [radius, setRadius] = useState<number>(15);
  const [autoDecline, setAutoDecline] = useState<number>(DEFAULTS.auto_decline_minutes);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/caregiver/instant-settings", {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          settings?: InstantSettings;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Failed to load");
        if (cancelled) return;
        const s = json.settings ?? DEFAULTS;
        setEnabled(s.enabled);
        setMinNotice(s.min_notice_minutes);
        if (s.instant_radius_km != null) {
          setUseCustomRadius(true);
          setRadius(s.instant_radius_km);
        } else {
          setUseCustomRadius(false);
        }
        setAutoDecline(s.auto_decline_minutes);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/caregiver/instant-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          min_notice_minutes: minNotice,
          instant_radius_km: useCustomRadius ? radius : null,
          auto_decline_minutes: autoDecline,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        settings?: InstantSettings;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-100 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <span aria-hidden>⚡</span> Instant booking
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Let families book you on demand — like ordering a ride. We&rsquo;ll
            only show you when you&rsquo;re likely available, and you can
            decline any request without penalty.
          </p>
        </div>
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!loaded}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <span className="relative w-11 h-6 bg-slate-200 peer-checked:bg-brand rounded-full transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition peer-checked:after:translate-x-5" />
        </label>
      </div>

      <div
        className={`space-y-4 ${enabled ? "" : "opacity-50 pointer-events-none"}`}
      >
        <div>
          <div className="text-sm font-medium text-slate-700">
            Minimum notice
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Don&rsquo;t accept instant bookings starting sooner than this.
          </p>
          <div className="flex flex-wrap gap-2">
            {NOTICE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMinNotice(o.value)}
                className={`px-3 py-1.5 rounded-xl border text-sm transition ${
                  minNotice === o.value
                    ? "bg-brand-50 border-brand-200 text-brand-700"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-slate-700">
            Instant booking radius
          </div>
          <p className="text-xs text-slate-500 mb-2">
            How far you&rsquo;re willing to travel for instant bookings. Leave
            unchecked to use your normal travel radius.
          </p>
          <label className="inline-flex items-center gap-2 text-sm mb-2">
            <input
              type="checkbox"
              checked={useCustomRadius}
              onChange={(e) => setUseCustomRadius(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Use a different radius for instant bookings
          </label>
          {useCustomRadius && (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="flex-1 accent-brand"
              />
              <div className="w-20 text-right text-sm font-medium text-slate-700">
                {radius} km
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-sm font-medium text-slate-700">
            Auto-decline timer
          </div>
          <p className="text-xs text-slate-500 mb-2">
            If you don&rsquo;t respond in this time, the request goes to the
            next nearest carer.
          </p>
          <div className="flex flex-wrap gap-2">
            {AUTO_DECLINE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAutoDecline(o.value)}
                className={`px-3 py-1.5 rounded-xl border text-sm transition ${
                  autoDecline === o.value
                    ? "bg-brand-50 border-brand-200 text-brand-700"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving || !loaded}
          className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save instant booking settings"}
        </button>
        {savedAt && (
          <span className="text-sm text-emerald-700">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
