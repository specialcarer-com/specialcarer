"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SERVICES } from "@/lib/care/services";
import { CARE_FORMATS } from "@/lib/care/formats";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CaregiverProfileFull, ProfileReadiness } from "@/lib/care/profile";
import {
  CERTIFICATIONS,
  GENDERS,
  SUGGESTED_TAGS,
  type GenderKey,
} from "@/lib/care/attributes";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

async function safeReadError(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await res.json()) as { error?: string };
      if (j?.error) return j.error;
    }
    const text = await res.text();
    if (text) return text.slice(0, 240);
  } catch {}
  return `Request failed (${res.status})`;
}

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
  const [careFormats, setCareFormats] = useState<string[]>(
    initial.care_formats ?? [],
  );
  const [hourlyRate, setHourlyRate] = useState<number>(
    initial.hourly_rate_cents ? initial.hourly_rate_cents / 100 : 18,
  );
  const [weeklyRate, setWeeklyRate] = useState<number>(
    initial.weekly_rate_cents ? initial.weekly_rate_cents / 100 : 750,
  );
  const [yearsExp, setYearsExp] = useState<number>(initial.years_experience ?? 0);
  const [languages, setLanguages] = useState<string>(
    (initial.languages ?? []).join(", "),
  );
  const [maxRadius, setMaxRadius] = useState<number>(initial.max_radius_km ?? 15);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.photo_url);
  const [isPublished, setIsPublished] = useState(initial.is_published);
  const [readiness, setReadiness] = useState<ProfileReadiness>(initialReadiness);
  // Booking preference attributes (additive)
  const [gender, setGender] = useState<GenderKey | "">(initial.gender ?? "");
  const [hasLicense, setHasLicense] = useState<boolean>(initial.has_drivers_license);
  const [hasVehicle, setHasVehicle] = useState<boolean>(initial.has_own_vehicle);
  const [tagsInput, setTagsInput] = useState<string>(
    (initial.tags ?? []).join(", "),
  );
  const [certs, setCerts] = useState<string[]>(initial.certifications ?? []);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleService(key: string) {
    setServices((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );
  }

  function toggleFormat(key: string) {
    setCareFormats((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  }

  function toggleCert(key: string) {
    setCerts((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  }

  function addTag(t: string) {
    const clean = t.trim().toLowerCase();
    if (!clean) return;
    const current = tagsInput
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (current.includes(clean)) return;
    setTagsInput([...current, clean].join(", "));
  }

  const offersVisiting = careFormats.includes("visiting");
  const offersLiveIn = careFormats.includes("live_in");
  const currencySymbol = country === "US" ? "$" : "£";

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
          care_formats: careFormats,
          hourly_rate_cents: offersVisiting
            ? Math.round(hourlyRate * 100)
            : null,
          weekly_rate_cents: offersLiveIn
            ? Math.round(weeklyRate * 100)
            : null,
          currency: country === "US" ? "USD" : "GBP",
          years_experience: Math.max(0, Math.min(60, Math.round(yearsExp))),
          languages: languages
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 8),
          max_radius_km: Math.max(1, Math.min(200, Math.round(maxRadius))),
          gender: gender || null,
          has_drivers_license: hasLicense,
          has_own_vehicle: hasVehicle,
          tags: tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 24),
          certifications: certs,
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
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setErr(null);

    // Client-side guards (mirror server)
    if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
      setErr("Photo must be JPG, PNG, or WebP.");
      input.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setErr("Photo must be 5 MB or smaller.");
      input.value = "";
      return;
    }

    setSaving(true);
    try {
      // Step 1: ask server for a signed upload URL
      const ext =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
      const issueRes = await fetch(`/api/caregiver/photo?ext=${ext}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!issueRes.ok) throw new Error(await safeReadError(issueRes));
      const issued = (await issueRes.json()) as {
        path?: string;
        token?: string;
        signedUrl?: string;
      };
      if (!issued.path || !issued.token) throw new Error("Could not start upload");

      // Step 2: upload the file directly to Supabase Storage
      const sb = createSupabaseBrowserClient();
      const { error: upErr } = await sb.storage
        .from("caregiver-photos")
        .uploadToSignedUrl(issued.path, issued.token, file, {
          contentType: file.type,
          upsert: true,
        });
      if (upErr) throw new Error(upErr.message);

      // Step 3: confirm — server records photo_url
      const confirmRes = await fetch("/api/caregiver/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: issued.path }),
      });
      if (!confirmRes.ok) throw new Error(await safeReadError(confirmRes));
      const json = (await confirmRes.json()) as {
        photo_url?: string;
        error?: string;
      };
      if (!json.photo_url) throw new Error(json.error ?? "Upload failed");

      // Cache-bust to force the new image to render immediately
      setPhotoUrl(`${json.photo_url}?t=${Date.now()}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload error");
    } finally {
      input.value = "";
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

      <Section title="Work I take on">
        <p className="text-sm text-slate-600 -mt-2">
          Choose live-in, visiting, or both. Live-in placements are paid as a
          weekly rate; visits are paid by the hour.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {CARE_FORMATS.map((f) => {
            const on = careFormats.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleFormat(f.key)}
                className={`text-left p-3 rounded-xl border transition ${
                  on
                    ? "bg-brand-50 border-brand-200 text-brand-700"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <span className="font-medium">{f.label}</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Paid by the {f.rateUnit}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Rate & experience">
        {careFormats.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 -mt-2">
            Select at least one work type above to set your rate.
          </p>
        )}
        <div className="grid sm:grid-cols-3 gap-4">
          {offersVisiting && (
            <Field
              label={`Hourly rate (${currencySymbol})`}
              help="For visiting work"
            >
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
          )}
          {offersLiveIn && (
            <Field
              label={`Weekly rate (${currencySymbol})`}
              help="For live-in placements"
            >
              <input
                type="number"
                min={100}
                max={5000}
                step={10}
                value={weeklyRate}
                onChange={(e) => setWeeklyRate(Number(e.target.value))}
                required
                className={INPUT_CLASS}
              />
            </Field>
          )}
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

      <Section title="Personal & extras">
        <p className="text-sm text-slate-600 -mt-2">
          Optional. These help families filter to the right match. None are
          required to publish.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Gender" help="Some families request gender-matched care">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as GenderKey | "")}
              className={INPUT_CLASS}
            >
              <option value="">Not specified</option>
              {GENDERS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Driving">
            <div className="flex flex-col gap-2 mt-1">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasLicense}
                  onChange={(e) => setHasLicense(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                I have a valid driver&rsquo;s licence
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasVehicle}
                  onChange={(e) => setHasVehicle(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                I have my own vehicle (insured for work use)
              </label>
            </div>
          </Field>
        </div>

        <Field
          label="Certifications"
          help="Tick everything you hold. Background checks are tracked separately."
        >
          <div className="mt-1 grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {CERTIFICATIONS.map((c) => {
              const on = certs.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCert(c.key)}
                  className={`text-left px-3 py-2 rounded-xl border text-sm transition ${
                    on
                      ? "bg-brand-50 border-brand-200 text-brand-700"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={`h-3.5 w-3.5 rounded border ${on ? "bg-brand border-brand" : "border-slate-300"}`}
                    />
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Tags (comma-separated)"
          help="Free-form keywords. e.g. non-smoker, pet-friendly, school-runs."
        >
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className={INPUT_CLASS}
            placeholder="non-smoker, pet-friendly, school-runs"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addTag(t)}
                className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition"
              >
                + {t}
              </button>
            ))}
          </div>
        </Field>
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
          <Check ok={readiness.hasFormat}>
            Live-in or visiting work declared
          </Check>
          <Check ok={readiness.hasRate}>Rate set for each work type</Check>
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
