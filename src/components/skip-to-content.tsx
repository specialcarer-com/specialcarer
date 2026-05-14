/**
 * Visible-on-focus skip link for keyboard users (WCAG 2.4.1 Bypass Blocks).
 *
 * Hidden off-screen by default; when a sighted keyboard user tabs onto the
 * page the link becomes visible in the top-left and lets them jump past the
 * header navigation straight to the page's main content region.
 *
 * Pair with an element that has id="main-content" (we add this on the
 * <MarketingShell> children wrapper) and tabIndex={-1} so the focus moves
 * cleanly into the content region after activation.
 */
export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-brand focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
    >
      Skip to main content
    </a>
  );
}
