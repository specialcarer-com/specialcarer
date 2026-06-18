import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { CaregiverProfileFull } from "@/lib/care/profile";
import { serviceLabel, formatMoney } from "@/lib/care/services";

// Brand typeface (Plus Jakarta Sans only). The public route uses the root
// layout (Inter), so we scope the font here for this world-readable surface.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

/**
 * Server-rendered public carer profile (no auth, GB-only).
 *
 * Intentionally minimal — this is the world-readable share/SEO surface, not
 * the full interactive app view at /m/carer/[id]. Brand: teal #039EA0.
 */
export default function PublicCarerProfile({
  profile,
}: {
  profile: CaregiverProfileFull;
}) {
  const name = profile.display_name ?? "Caregiver";
  const location = [profile.city, "UK"].filter(Boolean).join(", ");
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main
      className={`${jakarta.variable} min-h-screen font-display`}
      style={{ background: "#F4EFE6", color: "#0F1416" }}
    >
      <header className="px-6 py-4">
        <Link href="/" className="font-display text-[18px] font-bold" style={{ color: "#039EA0" }}>
          SpecialCarers
        </Link>
      </header>

      <section className="mx-auto max-w-2xl px-6 pb-16">
        <div className="rounded-card bg-white p-6 shadow-card sm:p-8">
          <div className="flex flex-col items-center text-center">
            {profile.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photo_url}
                alt={name}
                className="h-28 w-28 rounded-full object-cover"
              />
            ) : (
              <div
                className="grid h-28 w-28 place-items-center rounded-full text-[28px] font-bold text-white"
                style={{ background: "#039EA0" }}
                aria-hidden
              >
                {initials || "SC"}
              </div>
            )}
            <h1 className="mt-4 font-display text-[26px] font-bold">{name}</h1>
            {profile.headline && (
              <p className="mt-1 text-[14px] text-[#0F1416]/70">{profile.headline}</p>
            )}
            {location && (
              <p className="mt-1 text-[13px] text-[#0F1416]/60">{location}</p>
            )}
            <p className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: "#039EA0" }}>
              <span aria-hidden>✓</span> Background-checked by SpecialCarers
            </p>
          </div>

          {profile.bio && (
            <p className="mt-6 whitespace-pre-line text-[14px] leading-relaxed text-[#0F1416]/80">
              {profile.bio}
            </p>
          )}

          {profile.services.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[#0F1416]/60">
                Services
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {profile.services.map((s) => (
                  <li
                    key={s}
                    className="rounded-pill px-3 py-1 text-[13px] font-medium"
                    style={{ background: "#F4EFE6", color: "#0F1416" }}
                  >
                    {serviceLabel(s)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(profile.hourly_rate_cents != null ||
            profile.weekly_rate_cents != null) && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              {profile.hourly_rate_cents != null && (
                <RateCard
                  value={`${formatMoney(profile.hourly_rate_cents)} / hr`}
                  label="Visiting care"
                />
              )}
              {profile.weekly_rate_cents != null && (
                <RateCard
                  value={`${formatMoney(profile.weekly_rate_cents)} / wk`}
                  label="Live-in care"
                />
              )}
            </div>
          )}

          <Link
            href={`/m/carer/${profile.user_id}`}
            className="mt-8 flex h-12 w-full items-center justify-center rounded-btn text-[15px] font-bold text-white"
            style={{ background: "#039EA0" }}
          >
            View full profile & book
          </Link>
        </div>

        <p className="mt-6 text-center text-[12px] text-[#0F1416]/60">
          Trusted, DBS-checked care across the UK.
        </p>
      </section>
    </main>
  );
}

function RateCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-btn border border-[#E5E0D5] p-3 text-center">
      <p className="text-[17px] font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-[#0F1416]/60">{label}</p>
    </div>
  );
}
