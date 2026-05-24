import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import * as Application from "expo-application";
import Constants from "expo-constants";
import {
  WEB_SCRIPT,
  type NativeToWeb,
  type WebToNative,
  type PermissionStatus,
} from "./bridge";
import {
  ensureBackgroundPermission,
  ensureForegroundPermission,
  startBackgroundUpdates,
  stopBackgroundUpdates,
} from "./location";
import { getSession, setSession } from "./storage";
import { registerForPushNotifications } from "./notifications";

const WEB_ORIGIN: string =
  (Constants.expoConfig?.extra as { webOrigin?: string } | undefined)?.webOrigin ||
  "https://specialcarer.com";

/**
 * Root WebView shell.
 *
 * Renders specialcarer.com inside a WebView and listens for postMessage events
 * from the web app. Native runtime owns:
 *   - Session storage (mirror of web auth state, pulled via bridge)
 *   - Background location (expo-location + TaskManager — survives app suspend)
 *   - Push tokens
 */
export default function WebShell() {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // Track the most recently registered push token per native shell so we can
  // revoke it on sign-out. Survives across re-renders without re-fetching.
  const lastRegisteredToken = useRef<string | null>(null);

  const sendToWeb = useCallback((msg: NativeToWeb) => {
    const js = `window.postMessage(${JSON.stringify(JSON.stringify(msg))}, '*'); true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  /**
   * POSTs to a same-origin endpoint from inside the WebView. The native
   * shell can't carry the Supabase session cookie, so we ask the WebView
   * (which does) to make the request. Fire-and-forget by design.
   */
  const callWebApi = useCallback((path: string, body: unknown) => {
    const js =
      "(function(){try{fetch(" +
      JSON.stringify(path) +
      ",{method:'POST',headers:{'content-type':'application/json'},body:" +
      JSON.stringify(JSON.stringify(body)) +
      ",credentials:'include'}).catch(function(){});}catch(e){}})(); true;";
    webRef.current?.injectJavaScript(js);
  }, []);

  const registerPushWithBackend = useCallback(async () => {
    const token = await registerForPushNotifications();
    if (!token) return;
    lastRegisteredToken.current = token;
    callWebApi("/api/m/push/register", {
      platform: Platform.OS,
      token,
      device_id: Application.getAndroidId?.() ?? null,
      app_version: Application.nativeApplicationVersion ?? null,
    });
  }, [callWebApi]);

  const unregisterPushWithBackend = useCallback(() => {
    const token = lastRegisteredToken.current;
    if (!token) return;
    callWebApi("/api/m/push/unregister", { token });
    lastRegisteredToken.current = null;
  }, [callWebApi]);

  const onMessage = useCallback(
    async (e: WebViewMessageEvent) => {
      let msg: WebToNative;
      try {
        msg = JSON.parse(e.nativeEvent.data) as WebToNative;
      } catch {
        return;
      }

      switch (msg.type) {
        case "auth.session": {
          const prev = await getSession();
          await setSession(msg.payload);
          // Sign-in transition (no prior user, now one): register push token.
          if (msg.payload.userId && !prev.userId) {
            void registerPushWithBackend();
          }
          // Sign-out transition (had a user, now null): revoke device token.
          if (!msg.payload.userId && prev.userId) {
            unregisterPushWithBackend();
          }
          break;
        }

        case "tracking.start": {
          const perm: PermissionStatus = await (async () => {
            const fg = await ensureForegroundPermission();
            if (!fg) return "denied";
            const bg = await ensureBackgroundPermission();
            return bg;
          })();

          if (perm === "denied") {
            sendToWeb({
              type: "tracking.status",
              payload: {
                bookingId: msg.payload.bookingId,
                active: false,
                permission: perm,
              },
            });
            return;
          }

          await startBackgroundUpdates(
            msg.payload.bookingId,
            msg.payload.trackingWindowEnd
          );
          sendToWeb({
            type: "tracking.status",
            payload: {
              bookingId: msg.payload.bookingId,
              active: true,
              permission: perm,
            },
          });
          break;
        }

        case "tracking.stop": {
          await stopBackgroundUpdates();
          sendToWeb({
            type: "tracking.status",
            payload: { bookingId: null, active: false },
          });
          break;
        }

        case "push.requestToken": {
          const token = await registerForPushNotifications();
          if (token) {
            lastRegisteredToken.current = token;
            callWebApi("/api/m/push/register", {
              platform: Platform.OS,
              token,
              device_id: Application.getAndroidId?.() ?? null,
              app_version: Application.nativeApplicationVersion ?? null,
            });
          }
          sendToWeb({ type: "push.token", payload: { token } });
          break;
        }

        case "haptics": {
          // Light dependency — defer to a follow-up iteration. No-op for now.
          break;
        }

        case "log": {
          if (__DEV__) {
            console.log(`[web:${msg.payload.level}]`, msg.payload.message);
          }
          break;
        }
      }
    },
    [sendToWeb, callWebApi, registerPushWithBackend, unregisterPushWithBackend]
  );

  // Announce native readiness once the page loads
  useEffect(() => {
    if (!ready) return;
    sendToWeb({
      type: "ready",
      payload: {
        platform: Platform.OS as "ios" | "android",
        version: Application.nativeApplicationVersion ?? "0.1.0",
      },
    });
  }, [ready, sendToWeb]);

  const platform = Platform.OS;
  const userAgentSuffix = `SpecialCarerApp/${Application.nativeApplicationVersion ?? "0.1.0"} (${platform})`;
  const injectedScript = WEB_SCRIPT.replace("__PLATFORM__", platform).replace(
    "__VERSION__",
    Application.nativeApplicationVersion ?? "0.1.0"
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={{ uri: `${WEB_ORIGIN}/?native=1` }}
        injectedJavaScriptBeforeContentLoaded={injectedScript}
        onMessage={onMessage}
        onLoadEnd={() => setReady(true)}
        applicationNameForUserAgent={userAgentSuffix}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        decelerationRate="normal"
        setSupportMultipleWindows={false}
        originWhitelist={["https://*", "specialcarer://*"]}
        onShouldStartLoadWithRequest={(req) => {
          // Keep navigation inside the WebView for our own origin.
          // External links (Stripe Checkout, Apple/Google sign-in popups, etc.) → system browser.
          try {
            const u = new URL(req.url);
            const ours = u.origin === WEB_ORIGIN;
            if (!ours && req.navigationType === "click") {
              Linking.openURL(req.url);
              return false;
            }
          } catch {
            return true;
          }
          return true;
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#0ea5e9" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
