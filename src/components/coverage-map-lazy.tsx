"use client";

/**
 * Lazy client wrapper for <CoverageMap />.
 *
 * Why: mapbox-gl is a ~1.7 MB JS chunk + its CSS. Importing the map directly
 * from a server component statically pulls those chunks into the page's chunk
 * graph (even though the actual mapbox-gl module is dynamically imported
 * inside CoverageMap's useEffect). This wrapper defers even the shell of
 * the component until the browser is parsing JS, which keeps the map out
 * of any SSR-emitted prefetch hints and avoids shipping its props as part
 * of the initial Flight payload.
 *
 * Usage:
 *   <CoverageMapLazy cities={...} height="480px" initialBounds="all" />
 *
 * Loading state is a plain skeleton box at the requested height so the page
 * doesn't reflow when the map paints.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type CoverageMapType from "@/components/coverage-map";

const CoverageMap = dynamic(() => import("@/components/coverage-map"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="w-full rounded-xl bg-slate-100 animate-pulse"
      style={{ minHeight: 240 }}
    />
  ),
});

export default function CoverageMapLazy(
  props: ComponentProps<typeof CoverageMapType>,
) {
  return <CoverageMap {...props} />;
}
