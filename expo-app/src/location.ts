import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { getActiveTracking, getSession, setActiveTracking } from "./storage";

const LOCATION_TASK = "specialcarer-shift-location";
const WEB_ORIGIN: string =
  (Constants.expoConfig?.extra as { webOrigin?: string } | undefined)?.webOrigin ||
  "https://specialcarer.com";

/**
 * Background location task.
 *
 * Defined at module-import time (Expo requires this — TaskManager picks it up
 * during native bootstrap). Each invocation:
 *   1. Reads activeBookingId + accessToken from SecureStore.
 *   2. POSTs the latest location to /api/shifts/[id]/ping.
 *   3. Auto-stops if the tracking window has expired.
 */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("[location task] error", error);
    return;
  }
  const payload = data as { locations?: Location.LocationObject[] } | undefined;
  const locations = payload?.locations ?? [];
  if (locations.length === 0) return;

  const { bookingId, trackingWindowEnd } = await getActiveTracking();
  if (!bookingId) {
    await stopBackgroundUpdates();
    return;
  }

  if (trackingWindowEnd && new Date(trackingWindowEnd).getTime() < Date.now()) {
    await setActiveTracking(null, null);
    await stopBackgroundUpdates();
    return;
  }

  const { accessToken } = await getSession();
  if (!accessToken) {
    // No session → can't authenticate the ping. Pause until app foregrounds.
    return;
  }

  // Send only the most recent fix (cheaper, server-side ordering is by recorded_at)
  const loc = locations[locations.length - 1];

  try {
    await fetch(`${WEB_ORIGIN}/api/shifts/${bookingId}/ping`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy_m: loc.coords.accuracy ?? null,
        heading: loc.coords.heading ?? null,
        speed_mps: loc.coords.speed ?? null,
        recorded_at: new Date(loc.timestamp).toISOString(),
      }),
    });
  } catch (e) {
    // Silent fail — TaskManager will retry on next interval
    console.warn("[location task] ping failed", e);
  }
});

export async function ensureForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function ensureBackgroundPermission(): Promise<"granted-always" | "granted-while-in-use" | "denied"> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "denied";
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status === "granted") return "granted-always";
  return "granted-while-in-use";
}

export async function startBackgroundUpdates(bookingId: string, trackingWindowEnd: string) {
  await setActiveTracking(bookingId, trackingWindowEnd);

  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (isRegistered) {
    // Already running — just refresh the active booking.
    return;
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15_000, // 15s — matches web client cadence
    distanceInterval: 10, // metres
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "SpecialCarer is sharing your location",
      notificationBody: "Active during your shift only — closes 15 min after the scheduled end.",
      notificationColor: "#0ea5e9",
    },
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.OtherNavigation,
    deferredUpdatesInterval: 0,
  });
}

export async function stopBackgroundUpdates() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => null);
  }
  await setActiveTracking(null, null);
}

export async function isTracking(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
}
