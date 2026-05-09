"use client";

/**
 * StatusBarController
 *
 * Pins the iOS / Android status bar to DARK glyphs on a white
 * background. The splash and the rest of the app are both white
 * surfaces, so no runtime flip is needed — we just enforce the
 * intended state once on mount in case the static Capacitor config
 * was overridden by a plugin earlier in the boot.
 *
 * Web (non-Capacitor) is a no-op — `Capacitor.isNativePlatform()`
 * returns false and we bail out.
 */

import { useEffect } from "react";

export default function StatusBarController() {
  useEffect(() => {
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      } catch {
        /* not on a native platform, or plugin not installed */
      }
    })();
  }, []);

  return null;
}
