"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * /m entry — decides whether to show onboarding or jump straight to the
 * authenticated home. Native Capacitor app loads /m as its initial route.
 *
 * Visual: deliberately blank. The native iOS launch image already covers
 * cold-start chrome, the redirect to /m/onboarding or /m/home completes
 * within a few hundred ms, and the branded splash now lives on /m/login
 * (just before sign-in). Showing a stand-in logo here added a flash of
 * an off-brand mark on a teal screen that users saw between the native
 * launch image and the destination route — we render nothing instead.
 */
export default function MobileEntry() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          router.replace("/m/home");
        } else {
          // Show onboarding on first launch; if the user has been here
          // before we still show it briefly — Skip is one tap away.
          router.replace("/m/onboarding");
        }
      } catch {
        if (!cancelled) router.replace("/m/onboarding");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Blank, brand-screen-coloured holding pane. No logo, no text — the
  // redirect lands within a few hundred ms.
  return (
    <main
      className="min-h-[100dvh] bg-bg-screen"
      aria-hidden="true"
    />
  );
}
