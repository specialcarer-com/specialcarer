type ExplainerVideoProps = {
  className?: string;
  autoPlay?: boolean;
};

export function ExplainerVideo({
  className = "",
  autoPlay = false,
}: ExplainerVideoProps) {
  return (
    <div
      className={`relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl shadow-lg ring-1 ring-slate-200 bg-slate-900 ${className}`}
    >
      <video
        className="w-full aspect-video"
        controls
        playsInline
        preload="metadata"
        poster="/video/specialcarer-explainer-poster.jpg"
        autoPlay={autoPlay}
        muted={autoPlay}
        aria-label="Special Carer App explainer video — how families find trusted, vetted carers"
      >
        <source src="/video/specialcarer-explainer.mp4" type="video/mp4" />
        Your browser doesn’t support embedded video. You can{" "}
        <a
          href="/video/specialcarer-explainer.mp4"
          className="underline text-brand-200"
        >
          download the video
        </a>{" "}
        instead.
      </video>
    </div>
  );
}
