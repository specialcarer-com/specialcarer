/**
 * Web-side bridge to the SpecialCarer Expo native shell.
 *
 * When the web app runs inside the native WebView, the wrapper injects
 * `window.SpecialCarerNative` (see expo-app/src/bridge.ts WEB_SCRIPT).
 * This module gives the rest of the web app a typed interface to call it
 * and to listen for native → web events.
 *
 * If the native bridge isn't present (i.e. running in a normal browser),
 * `isNative()` returns false and the helpers no-op so the same UI code
 * continues to work in both contexts.
 */

declare global {
  interface Window {
    SpecialCarerNative?: {
      isNative: true;
      platform: "ios" | "android" | string;
      version: string;
      sendSession: (s: {
        userId: string | null;
        role: "seeker" | "caregiver" | null;
        accessToken?: string;
      }) => void;
      startTracking: (p: { bookingId: string; trackingWindowEnd: string }) => void;
      stopTracking: (p: { bookingId: string }) => void;
      requestPushToken: () => void;
      haptics: (kind: "light" | "medium" | "heavy" | "success" | "warning" | "error") => void;
      log: (level: "info" | "warn" | "error", message: string) => void;
    };
  }
}

export type NativeEvent =
  | { type: "ready"; payload: { platform: string; version: string } }
  | {
      type: "tracking.status";
      payload: {
        bookingId: string | null;
        active: boolean;
        lastPingAt?: string | null;
        permission?: "granted-always" | "granted-while-in-use" | "denied" | "undetermined";
      };
    }
  | { type: "push.token"; payload: { token: string | null } }
  | { type: "deepLink"; payload: { url: string } };

export function isNative(): boolean {
  return typeof window !== "undefined" && !!window.SpecialCarerNative?.isNative;
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const p = window.SpecialCarerNative?.platform;
  if (p === "ios" || p === "android") return p;
  return "web";
}

export function sendSessionToNative(s: {
  userId: string | null;
  role: "seeker" | "caregiver" | null;
  accessToken?: string;
}) {
  if (!isNative()) return;
  window.SpecialCarerNative!.sendSession(s);
}

export function startNativeTracking(bookingId: string, trackingWindowEnd: string) {
  if (!isNative()) return false;
  window.SpecialCarerNative!.startTracking({ bookingId, trackingWindowEnd });
  return true;
}

export function stopNativeTracking(bookingId: string) {
  if (!isNative()) return false;
  window.SpecialCarerNative!.stopTracking({ bookingId });
  return true;
}

export function requestNativePushToken() {
  if (!isNative()) return;
  window.SpecialCarerNative!.requestPushToken();
}

export function onNativeEvent(handler: (e: NativeEvent) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent<NativeEvent>).detail;
    if (detail && typeof detail === "object" && "type" in detail) handler(detail);
  };
  window.addEventListener("specialcarer:native", listener as EventListener);
  return () => window.removeEventListener("specialcarer:native", listener as EventListener);
}
