type HeroBannerProps = {
  isUS?: boolean;
};

/**
 * Silent looping hero banner that sits directly under the top nav.
 * Mobile: shows poster + plays inline (silent autoplay is allowed when muted).
 * Desktop: full-bleed cinematic loop with a soft gradient overlay so any
 *   text placed above it (e.g. eyebrow chip / H1) stays legible.
 */
export function HeroBanner({ isUS }: HeroBannerProps) {
  return (
    <div className="relative w-full overflow-hidden bg-slate-900">
      <video
        key="hero-banner-v2"
        className="block w-full h-[320px] sm:h-[420px] lg:h-[520px] object-cover object-[center_25%]"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster="/video/specialcarer-hero-banner-poster.jpg"
        aria-label="Vetted SpecialCarer caregivers welcoming families and supporting elderly clients in everyday moments"
      >
        <source src="/video/specialcarer-hero-banner.webm" type="video/webm" />
        <source src="/video/specialcarer-hero-banner.mp4" type="video/mp4" />
      </video>

      {/* Soft gradient + bottom fade for text legibility */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-900/10 to-white"
      />

      {/* Caption strip sitting on the video */}
      <div className="absolute inset-x-0 bottom-0 px-6 pb-6 sm:pb-10">
        <div className="max-w-5xl mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-white/95 text-brand-700 text-xs font-medium shadow-sm">
            {isUS
              ? "Background-checked carers · UK + US"
              : "Vetted carers · UK + US"}
          </span>
          <p className="mt-3 text-white text-lg sm:text-xl font-medium drop-shadow-sm max-w-2xl mx-auto">
            Childcare · Elderly care · Special-needs · Postnatal support
          </p>
        </div>
      </div>
    </div>
  );
}
