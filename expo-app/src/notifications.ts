import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Foreground push behaviour. We intentionally show banner + list + sound + badge
// when a notification arrives while the app is open — suppressing it would
// strand the user on the wrong screen even though PR-A5 wires deeplink tap
// handling. `shouldShowAlert` is the legacy iOS field kept for back-compat with
// older expo-notifications versions; `shouldShowBanner` / `shouldShowList` are
// the modern split (banner = transient HUD, list = notification centre).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push notifications don't work in the iOS Simulator
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0ea5e9",
    });
    await Notifications.setNotificationChannelAsync("shifts", {
      name: "Shift updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0ea5e9",
    });
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId || projectId === "REPLACE_AFTER_EAS_INIT") {
    // Pre-EAS-init: skip token issuance so dev builds don't crash
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}
