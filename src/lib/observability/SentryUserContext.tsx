"use client";

/**
 * Tags Sentry events with a minimal, non-PII view of the current user.
 *
 * Mounted once in the root layout. It subscribes to Supabase auth changes and,
 * on sign-in, sets ONLY the user id, role (as Sentry's `segment`) and country.
 * It NEVER sets `email` or `username`. On sign-out it clears the user.
 *
 * This is a side-effect-only component: it renders nothing and makes no UI
 * changes.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/client";

export default function SentryUserContext() {
  useEffect(() => {
    const supabase = createClient();

    async function applyUser(userId: string | undefined) {
      if (!userId) {
        Sentry.setUser(null);
        return;
      }
      // Fetch only the two non-PII profile fields we tag with.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, country")
        .eq("id", userId)
        .maybeSingle();
      Sentry.setUser({
        id: userId,
        segment: profile?.role ?? undefined,
        // Custom, non-PII attribute. Country is coarse (GB/US), not an address.
        country: profile?.country ?? undefined,
      });
    }

    // Seed from the current session on mount.
    supabase.auth.getUser().then(({ data }) => {
      void applyUser(data.user?.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void applyUser(session.user.id);
      } else {
        Sentry.setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
