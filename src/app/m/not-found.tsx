import Link from "next/link";
import { IconBell, IconChevronLeft } from "./_components/ui";

/**
 * Branded 404 for any unmatched /m/* route.
 *
 * Why this exists: the default Next.js 404 has no header, no back
 * button and no nav, which strands users on a dead-end (we hit this
 * when the notification bell linked to /m/notifications before that
 * route existed). Even after fixing the immediate cause we want a
 * permanent safety net — any future broken deeplink (push notification,
 * email link, stale build) lands here instead of the unstyled fallback.
 *
 * Design notes:
 *  - We can't use the shared TopBar because not-found.tsx renders
 *    server-side and TopBar is a client-island sibling of layout
 *    state. Inlining a minimal back chevron keeps this dependency-free
 *    and removes a hydration risk on this rare path.
 *  - "Go back" is intentionally a Link to /m/home rather than a
 *    history.back() button — server components can't run that, and
 *    history may be empty if the user opened the URL directly.
 */
export default function MobileNotFound() {
  return (
    <main className="min-h-[100dvh] bg-bg-screen flex flex-col">
      {/* Inline mini TopBar — back chevron returns to home */}
      <div className="sc-safe-top sticky top-0 z-30 bg-white">
        <div className="flex items-center h-14 px-4">
          <Link
            href="/m/home"
            className="-ml-2 p-2 sc-no-select"
            aria-label="Back to home"
          >
            <IconChevronLeft />
          </Link>
          <h1 className="text-[18px] font-bold text-heading">Page not found</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-20 h-20 rounded-full grid place-items-center"
          style={{ background: "rgba(3,158,160,0.1)", color: "#039EA0" }}
          aria-hidden
        >
          <IconBell />
        </div>
        <h2 className="mt-6 text-[22px] font-bold text-heading">
          We couldn&apos;t find that page
        </h2>
        <p className="mt-3 text-[14px] text-subheading leading-relaxed max-w-xs">
          The link may be out of date or the page may have moved. Head back to
          the home screen and try again from there.
        </p>

        <div className="mt-8 w-full max-w-xs space-y-3">
          <Link
            href="/m/home"
            className="block w-full text-center font-bold text-white bg-primary rounded-full py-3 sc-no-select"
          >
            Back to home
          </Link>
          <Link
            href="/m/search"
            className="block w-full text-center font-bold text-primary bg-white border border-primary rounded-full py-3 sc-no-select"
          >
            Find a carer
          </Link>
        </div>
      </div>
    </main>
  );
}
