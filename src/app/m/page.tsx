"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * /m entry — decides whether to show onboarding or jump straight to the
 * authenticated home. Native Capacitor app loads /m as its initial route.
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

  // Splash while we decide — brand teal, centred logo.
  return (
    <main className="min-h-[100dvh] grid place-items-center bg-primary text-white">
      <div className="flex flex-col items-center gap-3">
        <svg
          viewBox="0 0 64 64"
          width={56}
          height={56}
          aria-hidden
          className="opacity-95"
        >
          <path
            d="M10 32c0-2 1.6-3.6 3.6-3.6S17.2 30 17.2 32v6.4c0 8.4 6.6 15 15 15s15-6.6 15-15V32c0-2 1.6-3.6 3.6-3.6S54.4 30 54.4 32v6.4c0 12.4-10 22.4-22.4 22.4S9.6 50.8 9.6 38.4V32Z"
            fill="#171E54"
          />
          <path
            d="M16 50c4-2 10-3.2 16-3.2s12 1.2 16 3.2c-3.2 6-9.6 10-16 10s-12.8-4-16-10Z"
            fill="#FFFFFF"
            opacity="0.85"
          />
        </svg>
        <p className="text-[18px] font-bold tracking-tight">SpecialCarer</p>
      </div>
    </main>
  );
}
