"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SERVICES } from "@/lib/care/services";
import { CARE_FORMATS } from "@/lib/care/formats";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CARER_FEE_PERCENT, CARER_PAYOUT_PERCENT } from "@/lib/fees/config";
import { US_REGION_ENABLED } from "@/lib/region";
import {
  LANGUAGE_OPTIONS,
  splitLanguages,
  startingStep,
  STEP_TITLES,
} from "./registration-steps";
import InstantBookingSection from "./InstantBookingSection";
import type { CaregiverProfileFull, ProfileReadiness } from "@/lib/care/profile";
import {
  CERTIFICATIONS,
  GENDERS,
  SUGGESTED_TAGS,
  type GenderKey,
} from "@/lib/care/attributes";

// Matches the limit enforced by PATCH /api/caregiver/profile.
const MAX_LANGUAGES = 8;
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
  // UK only for now: the country picker is hidden until the US launch.
  const [country, setCountry] = useState<"GB" | "US">(
    US_REGION_ENABLED ? initial.country : "GB",
  );
  const [postcode, setPostcode] = useState(initial.postcode ?? "");
  const [hidePreciseLocation, setHidePreciseLocation] = useState<boolean>(
    initial.hide_precise_location !== false,
  );
  const [services, setServices] = useState<string[]>(initial.services);
  const [careFormats, setCareFormats] = useState<string[]>(
    initial.care_formats ?? [],
  );
  const [hourlyRate, setHourlyRate] = useState<number>(
    initial.hourly_rate_cents ? initial.hourly_rate_cents / 100 : 18,
  );
  // Weekly rate is optional: blank means "agree it with the family".
  const [weeklyRate, setWeeklyRate] = useState<number | "">(
    initial.weekly_rate_cents ? initial.weekly_rate_cents / 100 : "",
  );
  const [yearsExp, setYearsExp] = useState<number>(initial.years_experience ?? 0);
  const initialLangs = splitLanguages(initial.languages ?? []);
  const [languages, setLanguages] = useState<string[]>(initialLangs.known);
  const [otherLanguages, setOtherLanguages] = useState<string>(
    initialLangs.other.join(", "),
  );
  const [step, setStep] = useState<number>(() => startingStep(initialReadiness));
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
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
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

  function toggleLanguage(l: string) {
    setLanguages((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
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

  async function save(): Promise<boolean> {
    setSaving(true);
    setErr(null);
    try {
      const weeklyCents =
        offersLiveIn && weeklyRate !== "" ? Math.round(weeklyRate * 100) : null;
      if (weeklyCents !== null && (weeklyCents < 10000 || weeklyCents > 500000)) {
        throw new Error(
          "Weekly rate should be between £100 and £5,000 — or leave it blank to agree it with each family.",
        );
      }
      const otherLangs = otherLanguages
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      const allLanguages = Array.from(new Set([...languages, ...otherLangs]));
      if (allLanguages.length > MAX_LANGUAGES) {
        throw new Error(
          `Please choose up to ${MAX_LANGUAGES} languages (you have ${allLanguages.length}). Untick a few and try again.`,
        );
      }
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
          weekly_rate_cents: weeklyCents,
          currency: country === "US" ? "USD" : "GBP",
          years_experience: Math.max(0, Math.min(60, Math.round(yearsExp))),
          languages: allLanguages,
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
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    if (step === 0 && !displayName.trim()) {
      setErr("Please add the name families will see.");
      return;
    }
    if (step === 2 && !city.trim()) {
      setErr("Please add your town or city so we can match you with nearby families.");
      return;
    }
    if (step === 2 && offersVisiting && !(hourlyRate >= 8)) {
      setErr("Please set an hourly rate of at least £8.");
      return;
    }
    if (await save()) {
      setStep((n) => Math.min(n + 1, STEP_TITLES.length - 1));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Jump to any step (progress pills, "add now" links, Back, Skip). Pending
  // edits are saved first so nothing is lost on refresh and the Go live
  // checklist reflects what was just entered. If the save fails, stay put and
  // show the error.
  async function goToStep(target: number) {
    if (target === step || saving) return;
    if (await save()) {
      setStep(target);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goBack() {
    void goToStep(Math.max(step - 1, 0));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // Enter key / submit: save and move on, same as the Next button.
    if (step < STEP_TITLES.length - 1) await goNext();
    else await save();
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
      setUpgradeUrl(null);
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
        upgrade_url?: string;
      };
      if (!res.ok) {
        setErr(json.error ?? "Action failed");
        if (json.readiness) setReadiness(json.readiness);
        if (json.upgrade_url) setUpgradeUrl(json.upgrade_url);
        return;
      }
      setIsPublished(!!json.is_published);
    });
  }

  const lastStep = STEP_TITLES.length - 1;
  const isGoLive = step === lastStep;
  const nextLabel = saving ? "Saving…" : step === lastStep - 1 ? "Save & review" : "Save & continue";

  return (
    <form onSubmit={handleSave} className="mt-8 space-y-6">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-900">
            Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
          </span>
          <span className="text-slate-500">
            {savedAt ? "Progress saved" : "Saved as you go"}
          </span>
        </div>
        <div
          className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEP_TITLES.length}
          aria-valuenow={step + 1}
        >
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }}
          />
        </div>
        <ol className="mt-3 flex flex-wrap gap-2">
          {STEP_TITLES.map((title, i) => (
            <li key={title}>
              <button
                type="button"
                onClick={() => void goToStep(i)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                  i === step
                    ? "bg-brand text-white border-brand"
                    : i < step
                      ? "bg-brand-50 text-brand-700 border-brand-200"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {i + 1}. {title}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <>
          <Section title="Your photo">
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
                  A clear, friendly headshot works best. JPG, PNG or WebP, up
                  to 5 MB. You can add this later.
                </p>
              </div>
            </div>
          </Section>

          <Section title="Tell families about you">
            <Field label="Name families will see">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                required
                className={INPUT_CLASS}
                placeholder="Emma Thompson"
              />
            </Field>
            <Field label="Headline" help="One short line families see at a glance (optional)">
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={120}
                className={INPUT_CLASS}
                placeholder="Maternity nurse · paediatric first-aid"
              />
            </Field>
            <Field
              label="About you"
              help="A few sentences on your experience and what families can expect from you."
            >
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={5}
                maxLength={2000}
                className={INPUT_CLASS}
                placeholder="What you specialise in, your experience, what families can expect."
              />
              <div className="text-xs text-slate-500 mt-1">
                {bio.trim().length >= 60
                  ? `${bio.length}/2000 — that's plenty`
                  : `${Math.max(0, 60 - bio.trim().length)} more characters needed before you can go live`}
              </div>
            </Field>
          </Section>
        </>
      )}

      {step === 1 && (
        <>
          <Section title="Who do you care for?">
            <p className="text-sm text-slate-600 -mt-2">Tick everything that applies.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {SERVICES.map((s) => {
                const on = services.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={on}
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

          <Section title="How do you work?">
            <p className="text-sm text-slate-600 -mt-2">
              Choose live-in, visiting, or both. Visits are paid by the hour;
              live-in placements are agreed as a weekly price.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {CARE_FORMATS.map((f) => {
                const on = careFormats.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={on}
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
        </>
      )}

      {step === 2 && (
        <>
          <Section title="Where you work">
            <div className="grid sm:grid-cols-2 gap-4">
              {US_REGION_ENABLED && (
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
              )}
              <Field label="Town or city">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  className={INPUT_CLASS}
                  placeholder="London"
                />
              </Field>
              <Field label="County or area (optional)">
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Greater London"
                />
              </Field>
              <Field label="How far will you travel? (km)">
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
            <div className="mt-4">
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hidePreciseLocation}
                  onChange={(e) => setHidePreciseLocation(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  Hide my exact location on the map.{" "}
                  <span className="text-slate-500">
                    Recommended: your pin shows at district level only until a
                    booking is confirmed.
                  </span>
                </span>
              </label>
            </div>
          </Section>

          <Section title="Your rates">
            {careFormats.length === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 -mt-2">
                Go back one step and choose how you work (visiting, live-in or
                both) to set your rates.
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              {offersVisiting && (
                <Field
                  label={`Hourly rate (${currencySymbol})`}
                  help={`You keep ${currencySymbol}${(
                    (hourlyRate * CARER_PAYOUT_PERCENT) /
                    100
                  ).toFixed(2)} per hour after our ${CARER_FEE_PERCENT}% platform fee`}
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
                  label={`Weekly rate for live-in (${currencySymbol}) — optional`}
                  help={
                    weeklyRate === ""
                      ? "Leave blank if you'd rather agree a price with each family."
                      : `You keep ${currencySymbol}${(
                          (weeklyRate * CARER_PAYOUT_PERCENT) /
                          100
                        ).toFixed(2)} per week after our ${CARER_FEE_PERCENT}% platform fee`
                  }
                >
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    step={10}
                    value={weeklyRate}
                    onChange={(e) =>
                      setWeeklyRate(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className={INPUT_CLASS}
                    placeholder="e.g. 750"
                  />
                </Field>
              )}
            </div>
          </Section>

          <Section title="Experience & languages">
            <Field label="Years of experience">
              <input
                type="number"
                min={0}
                max={60}
                value={yearsExp}
                onChange={(e) => setYearsExp(Number(e.target.value))}
                className={`${INPUT_CLASS} sm:max-w-[10rem]`}
              />
            </Field>
            <Field label="Languages you speak" help="Tick up to 8.">
              <div className="mt-1 flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((l) => {
                  const on = languages.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleLanguage(l)}
                      className={`px-3 py-1.5 rounded-full border text-sm transition ${
                        on
                          ? "bg-brand-50 border-brand-200 text-brand-700"
                          : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {l}
                    </button>
                  );
                })}
              </div>
              <input
                value={otherLanguages}
                onChange={(e) => setOtherLanguages(e.target.value)}
                className={`${INPUT_CLASS} mt-3`}
                placeholder="Other languages (separate with commas)"
              />
            </Field>
          </Section>
        </>
      )}

      {step === 3 && (
        <Section title="A few extras">
          <p className="text-sm text-slate-600 -mt-2">
            All optional. These help families find the right match, and you
            can skip this step.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Gender" help="Some families ask for gender-matched care">
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as GenderKey | "")}
                className={INPUT_CLASS}
              >
                <option value="">Prefer not to say</option>
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
            help="Tick everything you hold. Background checks are handled separately."
          >
            <div className="mt-1 grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {CERTIFICATIONS.map((c) => {
                const on = certs.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
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
            label="Tags"
            help="Short keywords such as non-smoker, pet-friendly, school-runs. Tap to add."
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
      )}

      {isGoLive && (
        <>
          <div className="rounded-2xl border border-brand/30 bg-brand-50 p-5">
            <h2 className="font-semibold text-brand-900">
              Before you go live: the Founder Membership
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Your profile and checks are free to set up. A £4.99/month
              Founder Membership is only needed when you publish, so families
              can find and book you. Your founder rate is locked for life.
            </p>
            <Link
              href="/m/carer/membership"
              className="mt-3 inline-flex items-center rounded-xl border border-brand px-4 py-2 text-sm font-medium text-brand-700 hover:bg-white"
            >
              Learn about membership
            </Link>
          </div>

          <div className="p-6 rounded-2xl border border-slate-100 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {isPublished ? "You're listed on SpecialCarer" : "Ready to go live?"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {isPublished
                    ? "Families can find and book you. Unpublish to pause new requests."
                    : "Tick off the list below, then publish."}
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
                {pending ? "Working…" : isPublished ? "Unpublish" : "Publish profile"}
              </button>
            </div>

            <ul className="mt-5 space-y-2 text-sm">
              <Check ok={readiness.hasName && readiness.hasBio}>
                About you (name and a short bio){" "}
                {!(readiness.hasName && readiness.hasBio) && (
                  <StepLink onClick={() => void goToStep(0)}>add now</StepLink>
                )}
              </Check>
              <Check ok={readiness.hasService && readiness.hasFormat}>
                Who you care for and how you work{" "}
                {!(readiness.hasService && readiness.hasFormat) && (
                  <StepLink onClick={() => void goToStep(1)}>add now</StepLink>
                )}
              </Check>
              <Check ok={readiness.hasRate && readiness.hasLocation}>
                Your area and hourly rate{" "}
                {!(readiness.hasRate && readiness.hasLocation) && (
                  <StepLink onClick={() => void goToStep(2)}>add now</StepLink>
                )}
              </Check>
              <Check ok={readiness.payoutsEnabled}>
                Payouts, so you get paid —{" "}
                <Link href="/dashboard/payouts" className="text-brand-700 underline">
                  {readiness.payoutsEnabled ? "connected" : "set up now"}
                </Link>
              </Check>
              <Check ok={readiness.bgChecksCleared}>
                Background checks —{" "}
                <Link href="/dashboard/verification" className="text-brand-700 underline">
                  {readiness.bgChecksCleared
                    ? "all cleared"
                    : `${readiness.missingChecks.length} still to do`}
                </Link>
              </Check>
            </ul>
          </div>

          {upgradeUrl && (
            <div className="rounded-xl border border-brand/30 bg-brand-50 p-4">
              <p className="text-sm font-semibold text-brand-900">
                One last thing: start your Founder Membership
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Publishing needs an active £4.99/month Founder Membership. Your
                profile is saved and nothing is lost.
              </p>
              <Link
                href={upgradeUrl}
                className="mt-3 inline-flex items-center rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                View membership
              </Link>
            </div>
          )}

          <InstantBookingSection />
        </>
      )}

      {err && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={goBack}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Back
          </button>
        )}
        {!isGoLive ? (
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
          >
            {nextLabel}
          </button>
        ) : (
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
        {step === 3 && !saving && (
          <button
            type="button"
            onClick={() => void goToStep(lastStep)}
            className="text-sm text-slate-500 underline hover:text-slate-700"
          >
            Skip for now
          </button>
        )}
        {savedAt && (
          <span className="text-sm text-emerald-700">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
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

function StepLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-brand-700 underline"
    >
      {children}
    </button>
  );
}
