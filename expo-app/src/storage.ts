import * as SecureStore from "expo-secure-store";

/**
 * Persistent native-side state.
 *
 * Used by the background location task because TaskManager spawns a fresh JS
 * context that has no access to the React component tree. The task reads the
 * active booking + access token from SecureStore each invocation.
 */

const KEYS = {
  accessToken: "sc.accessToken",
  userId: "sc.userId",
  role: "sc.role",
  activeBookingId: "sc.activeBookingId",
  trackingWindowEnd: "sc.trackingWindowEnd",
} as const;

export async function setSession(s: {
  userId: string | null;
  role: "seeker" | "caregiver" | null;
  accessToken?: string;
}) {
  if (s.userId) await SecureStore.setItemAsync(KEYS.userId, s.userId);
  else await SecureStore.deleteItemAsync(KEYS.userId);
  if (s.role) await SecureStore.setItemAsync(KEYS.role, s.role);
  else await SecureStore.deleteItemAsync(KEYS.role);
  if (s.accessToken) await SecureStore.setItemAsync(KEYS.accessToken, s.accessToken);
  else await SecureStore.deleteItemAsync(KEYS.accessToken);
}

export async function getSession() {
  return {
    userId: (await SecureStore.getItemAsync(KEYS.userId)) || null,
    role: ((await SecureStore.getItemAsync(KEYS.role)) as "seeker" | "caregiver" | null) || null,
    accessToken: (await SecureStore.getItemAsync(KEYS.accessToken)) || null,
  };
}

export async function setActiveTracking(bookingId: string | null, trackingWindowEnd: string | null) {
  if (bookingId) {
    await SecureStore.setItemAsync(KEYS.activeBookingId, bookingId);
  } else {
    await SecureStore.deleteItemAsync(KEYS.activeBookingId);
  }
  if (trackingWindowEnd) {
    await SecureStore.setItemAsync(KEYS.trackingWindowEnd, trackingWindowEnd);
  } else {
    await SecureStore.deleteItemAsync(KEYS.trackingWindowEnd);
  }
}

export async function getActiveTracking() {
  const bookingId = await SecureStore.getItemAsync(KEYS.activeBookingId);
  const trackingWindowEnd = await SecureStore.getItemAsync(KEYS.trackingWindowEnd);
  return { bookingId, trackingWindowEnd };
}
