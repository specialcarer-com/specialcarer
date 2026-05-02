/**
 * Native ↔ Web bridge protocol.
 *
 * The WebView and the React Native shell exchange JSON messages via
 * window.ReactNativeWebView.postMessage (web → native) and webview.postMessage
 * (native → web). Both sides import this file (the native side directly, the
 * web side via a small client we inject as a userScript).
 *
 * Shape: every message has { type, payload?, requestId? }.
 * Bidirectional. Native acks web requests by echoing requestId.
 */

export type WebToNative =
  // The web reports the current user (or null if logged out)
  | { type: "auth.session"; payload: { userId: string | null; role: "seeker" | "caregiver" | null; accessToken?: string } }
  // The web wants the native runtime to start tracking for this booking
  | { type: "tracking.start"; payload: { bookingId: string; trackingWindowEnd: string } }
  // The web wants the native runtime to stop tracking
  | { type: "tracking.stop"; payload: { bookingId: string } }
  // The web wants the native push token (for registering with our backend)
  | { type: "push.requestToken" }
  // Web wants haptic feedback
  | { type: "haptics"; payload: { kind: "light" | "medium" | "heavy" | "success" | "warning" | "error" } }
  // Generic log forwarding for native console
  | { type: "log"; payload: { level: "info" | "warn" | "error"; message: string } };

export type NativeToWeb =
  | { type: "ready"; payload: { platform: "ios" | "android"; version: string } }
  | { type: "tracking.status"; payload: { bookingId: string | null; active: boolean; lastPingAt?: string | null; permission?: PermissionStatus } }
  | { type: "push.token"; payload: { token: string | null } }
  | { type: "deepLink"; payload: { url: string } };

export type PermissionStatus =
  | "granted-always"
  | "granted-while-in-use"
  | "denied"
  | "undetermined";

/**
 * Userscript injected into the WebView so the web app can call window.SpecialCarerNative.* helpers.
 * Kept as a string so it ships with the bundle without needing a separate build step.
 */
export const WEB_SCRIPT = `
(function() {
  if (window.SpecialCarerNative) return;
  function send(msg) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) {}
  }
  window.SpecialCarerNative = {
    isNative: true,
    platform: '__PLATFORM__',
    version: '__VERSION__',
    sendSession: function(s) { send({ type: 'auth.session', payload: s }); },
    startTracking: function(p) { send({ type: 'tracking.start', payload: p }); },
    stopTracking: function(p) { send({ type: 'tracking.stop', payload: p }); },
    requestPushToken: function() { send({ type: 'push.requestToken' }); },
    haptics: function(kind) { send({ type: 'haptics', payload: { kind: kind || 'light' } }); },
    log: function(level, message) { send({ type: 'log', payload: { level: level, message: message } }); }
  };
  document.documentElement.setAttribute('data-native', '1');
  // Listen for messages from native
  window.addEventListener('message', function(ev) {
    try {
      var msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
      window.dispatchEvent(new CustomEvent('specialcarer:native', { detail: msg }));
    } catch (e) {}
  });
  // Same for documents, RN sometimes posts to document
  document.addEventListener('message', function(ev) {
    try {
      var msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
      window.dispatchEvent(new CustomEvent('specialcarer:native', { detail: msg }));
    } catch (e) {}
  });
  send({ type: 'log', payload: { level: 'info', message: 'SpecialCarerNative bridge ready' } });
})();
true;
`;
