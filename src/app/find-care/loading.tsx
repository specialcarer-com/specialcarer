/**
 * Suspense fallback shown by Next.js while /find-care re-renders for new
 * search params (postcode, filters, etc). The page itself is a server
 * component, so this only kicks in for client-side navigations — but
 * those are the cases where the user is actively tweaking filters and
 * benefits most from immediate visual feedback.
 *
 * The skeleton mirrors the real layout so the page doesn't lurch when
 * results arrive: header strip, filter rail (desktop), then a grid of
 * card placeholders.
 */
import MarketingShell from "@/components/marketing-shell";

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/2 bg-slate-200 rounded" />
          <div className="h-3 w-1/3 bg-slate-100 rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full bg-slate-100 rounded" />
        <div className="h-3 w-5/6 bg-slate-100 rounded" />
        <div className="h-3 w-2/3 bg-slate-100 rounded" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-7 w-20 bg-slate-100 rounded-full" />
        <div className="h-7 w-16 bg-slate-100 rounded-full" />
      </div>
    </div>
  );
}

export default function FindCareLoading() {
  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-6 py-10">
        {/* Title strip */}
        <div className="space-y-3 animate-pulse" aria-hidden>
          <div className="h-8 w-3/4 max-w-md bg-slate-200 rounded" />
          <div className="h-4 w-1/2 max-w-sm bg-slate-100 rounded" />
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          {/* Filter rail */}
          <aside className="hidden lg:block space-y-4" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-full bg-slate-100 rounded-lg animate-pulse"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </aside>

          {/* Results grid */}
          <div>
            <div
              role="status"
              aria-live="polite"
              className="sr-only"
            >
              Loading caregivers, please wait.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
