"use client";

/**
 * BiometricLockProvider — mounts the biometric app-lock around the /m surface.
 *
 * Mounted only when MOBILE_PERSISTENT_AUTH_ENABLED is on (see /m/layout.tsx),
 * so when the flag is OFF this component never renders and the app behaves
 * exactly as it does today.
 *
 * Lifecycle:
 *   cold start → resolve session + biometric capability + saved preference →
 *     shouldLock? → show LockScreen and prompt biometric → on success render app
 *   foreground (via @capacitor/app appStateChange) → if backgrounded longer
 *     than the threshold, re-lock.
 *
 * Graceful degradation: no session, no biometric hardware, or the toggle off
 * all resolve to "unlocked" immediately — the user simply stays signed in.
 *
 * Pure decisions are delegated to lock-core; all plugin/DOM side effects to
 * lock-native. The Supabase session check uses the existing browser client.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  shouldLock,
  shouldRelockOnResume,
  defaultPreference,
  biometricLabel as labelFor,
  type BiometricCapability,
  type LockReason,
  type LockStatus,
} from "@/lib/mobile-auth/lock-core";
import {
  getBiometricCapability,
  getPlatform,
  promptBiometric,
  readLockPreference,
  writeLockPreference,
} from "@/lib/mobile-auth/lock-native";
import { waitForHydratedSession } from "@/lib/mobile-auth/lock-session";
import LockScreen from "./LockScreen";

export default function BiometricLockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<LockStatus>("unknown");
  const [reason, setReason] = useState<LockReason>("cold-start");
  const [prompting, setPrompting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [label, setLabel] = useState("biometric unlock");

  // Capability is resolved once per process and reused on resume.
  const capabilityRef = useRef<BiometricCapability | null>(null);
  const backgroundedAtRef = useRef<number | null>(null);

  const runPrompt = useCallback(async (lockReason: LockReason) => {
    setPrompting(true);
    setFailed(false);
    const outcome = await promptBiometric("Unlock to continue");
    setPrompting(false);

    if (outcome === "ok") {
      setStatus("unlocked");
      return;
    }
    if (outcome === "biometric-changed") {
      // Enrolment changed — the stored session can no longer be trusted.
      setReason("biometric-changed");
      setStatus("locked");
      return;
    }
    // "cancelled" or "failed" → keep the lock screen up, let the user retry.
    setFailed(true);
    setStatus("locked");
  }, []);

  // ─── cold-start evaluation ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const hasSession = await waitForHydratedSession({
        getSession: async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          return !!session;
        },
        subscribeInitialSession: (onResolved) => {
          const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "INITIAL_SESSION") {
              onResolved(!!session);
            }
          });
          return () => data.subscription.unsubscribe();
        },
      });

      const capability = await getBiometricCapability();
      capabilityRef.current = capability;

      const platform = await getPlatform();
      if (!cancelled) {
        setLabel(labelFor(capability.kind, platform));
      }

      // Resolve the saved preference, seeding the default the first time.
      let preferenceEnabled = await readLockPreference();
      if (preferenceEnabled === null) {
        preferenceEnabled = defaultPreference(capability);
        if (hasSession && capability.available) {
          await writeLockPreference(preferenceEnabled);
        }
      }

      if (cancelled) return;

      if (shouldLock({ hasSession, preferenceEnabled, capability })) {
        setReason("cold-start");
        setStatus("locked");
        void runPrompt("cold-start");
      } else {
        setStatus("unlocked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runPrompt]);

  // ─── foreground re-lock ───────────────────────────────────────────────────
  useEffect(() => {
    let remove: (() => void) | undefined;
    (async () => {
      let App: typeof import("@capacitor/app").App;
      try {
        ({ App } = await import("@capacitor/app"));
      } catch {
        return; // not native — no app-state events
      }
      const handle = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          backgroundedAtRef.current = Date.now();
          return;
        }
        // Became active. Re-lock only if eligible and the gap is long enough.
        const capability = capabilityRef.current;
        if (!capability?.available) return;

        const relock = shouldRelockOnResume({
          backgroundedAt: backgroundedAtRef.current,
          now: Date.now(),
        });
        backgroundedAtRef.current = null;
        if (!relock) return;

        // Re-check the preference at resume time (user may have toggled it off).
        void (async () => {
          const pref = await readLockPreference();
          if (pref === false) return;
          setReason("resumed-after-timeout");
          setFailed(false);
          setStatus("locked");
          void runPrompt("resumed-after-timeout");
        })();
      });
      remove = () => {
        void handle.remove();
      };
    })();
    return () => {
      remove?.();
    };
  }, [runPrompt]);

  const onUsePassword = useCallback(async () => {
    // Abandon the biometric gate for this session and route to a clean sign-in.
    const supabase = createClient();
    await supabase.auth.signOut().catch(() => {});
    setStatus("unlocked");
    router.replace("/m/login");
  }, [router]);

  // While resolving, render nothing over the splash to avoid a flash of app
  // content before we know whether a lock is required.
  if (status === "unknown") return null;

  if (status === "locked") {
    return (
      <LockScreen
        reason={reason}
        biometricLabel={label}
        prompting={prompting}
        failed={failed}
        onUnlock={() => void runPrompt(reason)}
        onUsePassword={() => void onUsePassword()}
      />
    );
  }

  return <>{children}</>;
}
