"use client";

import { useEffect, useRef, useState } from "react";

const POSTER = "/posters/specialcarer-app-teaser.jpg";
const MP4 = "/video/specialcarer-app-teaser.mp4";
const WEBM = "/video/specialcarer-app-teaser.webm";

/**
 * Hero teaser video for the "Coming soon · Download the App" section.
 *
 * - 8s synthetic product teaser, no audio, autoplay/loop/muted/playsInline
 * - Respects prefers-reduced-motion by falling back to the static poster
 * - Uses IntersectionObserver to pause playback when offscreen
 * - preload="metadata" to avoid eager download of the full asset
 */
export function HeroTeaserVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Detect prefers-reduced-motion (only on the client).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  // Pause video when offscreen.
  useEffect(() => {
    if (reducedMotion) return;
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {
            /* autoplay can be blocked — silently ignore */
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setIsPaused(false);
    } else {
      video.pause();
      setIsPaused(true);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-3xl"
      aria-label="SpecialCarers product walkthrough"
    >
      {/* Soft teal glow behind the video */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-teal-400/20 blur-3xl"
      />

      <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/15 shadow-2xl">
        {reducedMotion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={POSTER}
            alt="A worried parent searches for a trusted carer on the SpecialCarers app."
            className="h-full w-full object-cover"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={POSTER}
              aria-label="SpecialCarers product walkthrough — worried parent finds a vetted carer through the app"
            >
              <source src={WEBM} type="video/webm" />
              <source src={MP4} type="video/mp4" />
            </video>
            <button
              type="button"
              onClick={togglePlayback}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm ring-1 ring-white/30 hover:bg-black/70 transition-colors"
              aria-label={isPaused ? "Play teaser video" : "Pause teaser video"}
            >
              {isPaused ? (
                <>
                  <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden="true">
                    <path d="M3 2v8l7-4z" />
                  </svg>
                  Play
                </>
              ) : (
                <>
                  <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden="true">
                    <rect x="3" y="2" width="2" height="8" />
                    <rect x="7" y="2" width="2" height="8" />
                  </svg>
                  Pause
                </>
              )}
            </button>
          </>
        )}
      </div>

      <p className="mt-3 text-center text-sm text-white/70">
        A quick look at how SpecialCarers connects families with vetted carers.
      </p>
    </div>
  );
}

export default HeroTeaserVideo;
