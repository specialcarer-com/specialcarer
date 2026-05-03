"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SERVICES } from "@/lib/care/services";
import type { CaregiverProfileFull, ProfileReadiness } from "@/lib/care/profile";

export default function ProfileEditor({
  initial,
  initialReadiness,
}: {
  initial: CaregiverProfileFull;
  initialReadiness: ProfileReadiness;
}) {
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [region, setRegion] = useState(initial.region ?? "");
  const [country, setCountry] = useState<"GB" | "US">(initial.country);
  const [services, setServices] = useState<string[]>(initial.services);
  const [hourlyRate, setHourlyRate] = useState<number>(
    initial.hourly_rate_cents ? initial.hourly_rate_cents / 100 : 18,
  );
  const [yearsExp, setYearsExp] = useState<number>(initial.years_experience ?? 0);
  const [languages, setLanguages] = useState<string>(
    (initial.languages ?? []).join(", "),
  );
  const [maxRadius, setMaxRadius] = useState<number>(initial.max_radius_km ?? 15);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.photo_url);
  const [isPublished, setIsPublished] = useState(initial.is_published);
  const [readiness, setReadiness] = useState<ProfileReadiness>(initialReadiness);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleService(key: string) {
    setServices((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/caregiver/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          headline,
          bio,
          city,
          region: region || null,
          country,
          services,
          hourly_rate_cents: Math.round(hourlyRate * 100),
          currency: country === "US" ? "USD" : "GBP",
          years_experience: Math.max(0, Math.min(60, Math.round(yearsExp))),
          languages: languages
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 8),
          max_radius_km: Math.max(1, Math.min(200, Math.round(maxRadius))),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        readiness?: ProfileReadiness;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (json.readiness) setReadiness(json.readiness);
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/caregiver/photo", { method: "POST", body: fd });
      const json = (await res.json()) as { photo_url?: string; error?: string };
      if (!res.ok || !json.photo_url) throw new Error(json.error ?? "Upload failed");
      setPhotoUrl(json.photo_url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload error");
    } finally {
      setSaving(false);
    }
  }

  function handlePublishToggle() {
    startTransition(async () => {
      setErr(null);
      const res = await fetch("/api/caregiver/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isPublished ? "unpublish" : "publish" }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        is_published?: boolean;
        error?: string;
        readiness?: ProfileReadiness;
      };
      if (!res.ok) {
        setErr(json.error ?? "Action failed");
        if (json.readiness) setReadiness(json.readiness);
        return;
      }
      setIsPublished(!!json.is_published);
    });
  }

  return (
    <form onSubmit={handleSave} className="mt-8 space-y-6">
      {/* Photo */}
      <Section title="Photo">
        <div className="flex items-center gap-5">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className="w-24 h-24 rounded-full object-cover bg-brand-50"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-semibold text-2xl">
              {(displayName.trim()[0] ?? "C").toUpperCase()}
            </div>
          )}
          <div>
            <label className="inline-block px-4 py-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 text-sm font-medium">
              Upload photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUpload}
                className="hidden"
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              JPG, PNG, or WebP — max 5 MB. Clear, well-lit headshot.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Basics">
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            required
            className={INPUT_CLASS}
            placeholder="Emma Thompson"
          />
        </Field>
        <Field label="Headline" help="One line that families see at a glance">
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={120}
            className={INPUT_CLASS}
            placeholder="Maternity nurse · paediatric first-aid"
          />
        </Field>
        <Field label="About you" help="At least 60 characters. Be specific.">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={5}
            maxLength={2000}
            className={INPUT_CLASS}
            placeholder="What you specialise in, your experience, what families can expect."
          />
          <div className="text-xs text-slate-500 mt-1">{bio.length}/2000</div>
        </Field>
      </Section>

      <Section title="Where you work">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Country">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value as "GB" | "US")}
              className={INPUT_CLASS}
            >
              <option value="GB">United Kingdom</option>
              <option value="US">United States</option>
            </select>
          </Field>
          <Field label="City">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className={INPUT_CLASS}
              placeholder={country === "US" ? "New York" : "London"}
            />
          </Field>
          <Field label="Region (optional)">
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={INPUT_CLASS}
              placeholder={country === "US" ? "NY" : "Greater London"}
            />
          </Field>
          <Field label="Travel radius (km)">
            <input
              type="number"
              min={1}
              max={200}
              value={maxRadius}
              onChange={(e) => setMaxRadius(Number(e.target.value))}
              className={INPUT_CLASS}
            />
          </Field>
        </div>
      </Section>

      <Section title="Services">
        <p className="text-sm text-slate-600 -mt-2">Select all that apply.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SERVICES.map((s) => {
            const on = services.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleService(s.key)}
                className={`text-left p-3 rounded-xl border transition ${
                  on
                    ? "bg-brand-50 border-brand-200 text-brand-700"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <span className="font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Rate & experience">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label={`Hourly rate (${country === "US" ? "$" : "£"})`}>
            <input
              type="number"
              min={8}
              max={200}
              step={1}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              required
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Years experience">
            <input
              type="number"
              min={0}
              max={60}
              value={yearsExp}
              onChange={(e) => setYearsExp(Number(e.target.value))}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Languages (comma-separated)">
            <input
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
              className={INPUT_CLASS}
              placeholder="English, Spanish"
            />
          </Field>
        </div>
      </Section>

      {err && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {savedAt && (
          <span className="text-sm text-emerald-700">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Publish gate */}
      <div className="mt-8 p-6 rounded-2xl border border-slate-100 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">
              {isPublished ? "Listed on SpecialCarer" : "Publish your profile"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {isPublished
                ? "Families can find and book you. Unpublish to pause new requests."
                : "When all checks below are green, you can go live."}
            </p>
          </div>
          <button
            type="button"
            disabled={pending || (!isPublished && !readiness.isPublishable)}
            onClick={handlePublishToggle}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50 ${
              isPublished
                ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                : "bg-brand text-white hover:bg-brand-600"
            }`}
          >
            {pending
              ? "Working…"
              : isPublished
                ? "Unpublish"
                : "Publish profile"}
          </button>
        </div>

        <ul className="mt-5 space-y-2 text-sm">
          <Check ok={readiness.hasName}>Display name set</Check>
          <Check ok={readiness.hasBio}>Bio (60+ characters)</Check>
          <Check ok={readiness.hasService}>At least one service selected</Check>
          <Check ok={readiness.hasRate}>Hourly rate set</Check>
          <Check ok={readiness.hasLocation}>City set</Check>
          <Check ok={readiness.payoutsEnabled}>
            Stripe payouts —{" "}
            <Link href="/dashboard/payouts" className="text-brand-700 underline">
              {readiness.payoutsEnabled ? "connected" : "set up now"}
            </Link>
          </Check>
          <Check ok={readiness.bgChecksCleared}>
            Background checks —{" "}
            <Link href="/dashboard/verification" className="text-brand-700 underline">
              {readiness.bgChecksCleared
                ? "all cleared"
                : `${readiness.missingChecks.length} still required`}
            </Link>
          </Check>
        </ul>
      </div>

    </form>
  );
}

const INPUT_CLASS =
  "mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-100 space-y-4">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700 font-medium">{label}</span>
      {help && <span className="block text-xs text-slate-500 mb-1">{help}</span>}
      {children}
    </label>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`w-5 h-5 mt-0.5 rounded-full flex items-center justify-center text-[11px] font-bold flex-none ${
          ok ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
        }`}
        aria-hidden
      >
        {ok ? "✓" : ""}
      </span>
      <span className={ok ? "text-slate-900" : "text-slate-700"}>{children}</span>
    </li>
  );
}
