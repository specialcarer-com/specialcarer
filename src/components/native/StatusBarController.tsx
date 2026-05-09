"use client";

/**
 * StatusBarController
 *
 * Runtime controller for the iOS / Android status bar. Capacitor's
 * static config sets the cold-launch state (LIGHT glyphs on dark teal
 * so the splash overlay reaches edge-to-edge with no white strip).
 * Once the splash fades and the user lands on the standard light app
 * chrome, we flip the glyphs to DARK so they stay readable on white.
 *
 * Strategy:
 *   - On mount: nothing yet (splash still painting). The splash overlay
 *     covers the status-bar area in dark teal, so LIGHT glyphs are
 *     correct.
 *   - After SPLASH_HANDOFF_MS: switch to DARK glyphs for white surfaces.
 *
 * Web (non-Capacitor) is a no-op — the plugin import returns a stub
 * and `Capacitor.isNativePlatform()` is false.
 */

import { useEffect } from "react";

const SPLASH_HANDOFF_MS = 8000; // splash visible 7000 + fade 320 + buffer

export default function StatusBarController() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { StatusBar, Style } = await import("@capacitor/status-bar");

        // Splash phase — keep glyphs LIGHT against the dark teal overlay.
        await StatusBar.setStyle({ style: Style.Light }).catch(() => {});

        // After the splash fades, flip to DARK glyphs so they stay
        // visible against the white app chrome that follows.
        const t = window.setTimeout(async () => {
          if (cancelled) return;
          try {
            await StatusBar.setStyle({ style: Style.Dark });
          } catch {
            /* noop */
          }
        }, SPLASH_HANDOFF_MS);

        return () => window.clearTimeout(t);
      } catch {
        /* not on a native platform, or plugin not installed */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
