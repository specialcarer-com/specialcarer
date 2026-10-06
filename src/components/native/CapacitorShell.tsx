"use client";

/**
 * Capacitor native shell wiring for the /m WebView app.
 *
 * Responsibilities (iOS + Android):
 *   - Register / revoke push tokens on auth transitions
 *   - Route deep links (custom scheme, App Links, push taps)
 *   - (Stripe / OAuth URL interception is not wired; see the note in the
 *     effect below.)
 *
 * No-ops in a normal browser — all Capacitor imports are dynamic.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { classifyDeeplink, pathFromAppUrl } from "@/lib/capacitor/deeplink";
import { shouldOpenExternally, openExternalUrl } from "@/lib/capacitor/browser";

type PushPlatform = "ios" | "android";

async function isNativeCapacitor(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function nativePlatform(): Promise<PushPlatform | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return p;
  } catch {
    /* not native */
  }
  return null;
}

async function registerPushToken(token: string, platform: PushPlatform) {
  await fetch("/api/m/push/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ platform, token }),
  });
}

async function unregisterPushToken(token: string) {
  await fetch("/api/m/push/unregister", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
}

export default function CapacitorShell() {
  const router = useRouter();
  const pushTokenRef = useRef<string | null>(null);
  const pendingDeeplinkRef = useRef<string | null>(null);

  const navigateDeeplink = (raw: unknown) => {
    const route = classifyDeeplink(raw);
    if (route.kind === "web") {
      router.push(route.path);
      return;
    }
    if (route.kind === "external") {
      void openExternalUrl(route.url);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      if (!(await isNativeCapacitor())) return;
      if (cancelled) return;

      const platform = await nativePlatform();
      if (!platform) return;

      // ── Push notifications ──────────────────────────────────────────────
      try {
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        );

        const perm = await PushNotifications.requestPermissions();
        if (perm.receive === "granted") {
          await PushNotifications.register();
        }

        const regHandle = await PushNotifications.addListener(
          "registration",
          (ev) => {
            if (!ev.value) return;
            pushTokenRef.current = ev.value;
            void registerPushToken(ev.value, platform);
          },
        );
        cleanups.push(() => void regHandle.remove());

        const actionHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const deeplink = action.notification.data?.deeplink;
            navigateDeeplink(deeplink);
          },
        );
        cleanups.push(() => void actionHandle.remove());
      } catch {
        /* google-services.json may be absent in local debug builds */
      }

      // ── Deep links (custom scheme + App Links) ──────────────────────────
      try {
        const { App } = await import("@capacitor/app");

        const urlHandle = await App.addListener("appUrlOpen", (event) => {
          const path = pathFromAppUrl(event.url);
          if (path) {
            router.push(path);
            return;
          }
          if (shouldOpenExternally(event.url)) {
            void openExternalUrl(event.url);
          }
        });
        cleanups.push(() => void urlHandle.remove());

        const launch = await App.getLaunchUrl();
        if (launch?.url) {
          const path = pathFromAppUrl(launch.url);
          if (path) pendingDeeplinkRef.current = path;
        }
      } catch {
        /* App plugin unavailable */
      }

      if (pendingDeeplinkRef.current) {
        router.push(pendingDeeplinkRef.current);
        pendingDeeplinkRef.current = null;
      }

      // ── Auth → push token lifecycle ─────────────────────────────────────
      const supabase = createClient();
      const { data: authSub } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (session?.user && pushTokenRef.current) {
            await registerPushToken(pushTokenRef.current, platform);
            return;
          }
          if (!session && pushTokenRef.current) {
            const token = pushTokenRef.current;
            pushTokenRef.current = null;
            await unregisterPushToken(token);
          }
        },
      );
      cleanups.push(() => authSub.subscription.unsubscribe());

      // NOTE: this effect used to monkey-patch `window.location.assign` to
      // send Stripe / Google / Apple URLs to the system browser. That never
      // worked: `location.assign` is a non-writable, non-configurable
      // property in every browser, so the assignment threw a TypeError
      // ("Attempted to assign to readonly property", Sentry
      // SPECIALCARER-WEB-C) on every native launch, after the push and
      // deep-link setup above had already completed. The dead block was
      // removed with no change in behaviour: Stripe/OAuth navigations have
      // never been intercepted. Callers that must leave the WebView should
      // call `openExternalUrl()` from `@/lib/capacitor/browser` directly.
    })();

    return () => {
      cancelled = true;
      for (const fn of cleanups) fn();
    };
  }, [router]);

  return null;
}
