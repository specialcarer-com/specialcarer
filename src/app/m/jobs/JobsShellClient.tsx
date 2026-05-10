"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BottomNav } from "../_components/ui";
import JobsFeedClient from "./JobsFeedClient";
import MyWorkClient from "./MyWorkClient";

type Mode = "my-work" | "find-work";

interface JobsShellClientProps {
  mapboxToken: string;
  mapStyle: string;
  defaultMode: Mode;
}

export default function JobsShellClient({
  mapboxToken,
  mapStyle,
  defaultMode,
}: JobsShellClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const paramMode = searchParams.get("mode") as Mode | null;
  const [mode, setMode] = useState<Mode>(
    paramMode === "my-work" || paramMode === "find-work"
      ? paramMode
      : defaultMode,
  );

  // Keep URL in sync when mode changes
  const handleSetMode = useCallback(
    (next: Mode) => {
      setMode(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("mode", next);
      // Remove sub-tab when switching modes so stale ?tab= doesn't leak
      if (next === "find-work") params.delete("tab");
      router.replace(`/m/jobs?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Sync external URL changes (e.g. browser back)
  useEffect(() => {
    const m = searchParams.get("mode") as Mode | null;
    if (m === "my-work" || m === "find-work") setMode(m);
  }, [searchParams]);

  return mode === "find-work" ? (
      // find-work: JobsFeedClient owns its own TopBar + BottomNav.
      // We overlay the mode toggle as a floating pill above the feed
      // so the user can switch back without the feed's header getting
      // pushed down.
      <div className="relative min-h-screen">
        <JobsFeedClient mapboxToken={mapboxToken} mapStyle={mapStyle} />
        {/* Floating toggle overlay — positioned below the native safe area */}
        <div className="fixed top-0 left-0 right-0 z-50 sc-safe-top pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-md px-5 pt-2">
            <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-pill p-1 gap-1 shadow-sm border border-line/60">
              <button
                type="button"
                onClick={() => handleSetMode("my-work")}
                className="flex-1 h-8 rounded-pill text-[13px] font-semibold transition-colors sc-no-select text-subheading"
              >
                My work
              </button>
              <button
                type="button"
                onClick={() => handleSetMode("find-work")}
                className="flex-1 h-8 rounded-pill text-[13px] font-semibold transition-colors sc-no-select bg-white text-heading shadow-sm"
              >
                Find work
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="min-h-screen bg-bg-screen sc-with-bottom-nav flex flex-col">
        {/* Mode toggle */}
        <div className="sticky top-0 z-30 bg-white border-b border-line sc-safe-top px-5 py-3">
          <div className="flex items-center bg-muted rounded-pill p-1 gap-1">
            <button
              type="button"
              onClick={() => handleSetMode("my-work")}
              className="flex-1 h-9 rounded-pill text-[14px] font-semibold transition-colors sc-no-select bg-white text-heading shadow-sm"
            >
              My work
            </button>
            <button
              type="button"
              onClick={() => handleSetMode("find-work")}
              className="flex-1 h-9 rounded-pill text-[14px] font-semibold transition-colors sc-no-select text-subheading"
            >
              Find work
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <MyWorkClient onFindWork={() => handleSetMode("find-work")} />
        </div>

        <BottomNav active="jobs" role="carer" />
      </div>
    );
}
