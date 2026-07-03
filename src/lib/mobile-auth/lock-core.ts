/**
 * Pure decision logic for the mobile biometric app-lock.
 *
 * This module holds NO Capacitor / DOM imports so it can be unit-tested with
 * the plain node:test runner. The side-effecting adapters (querying biometric
 * hardware, reading Preferences, prompting the OS) live in `lock-native.ts`
 * and feed their results into the pure functions here.
 *
 * State machine (consumed by BiometricLockProvider):
 *
 *   unknown   → still resolving capability / preference (render nothing)
 *   locked    → biometric required; show LockScreen, do not render app
 *   unlocked  → app visible
 *
 * The provider only ever LOCKS when `shouldLock` returns true, and only ever
 * shows the unlock prompt when `shouldPromptUnlock` allows it.
 */

export type LockStatus = "unknown" | "locked" | "unlocked";

/** Why a fresh unlock is being required — drives the LockScreen copy. */
export type LockReason =
  | "cold-start"
  | "resumed-after-timeout"
  | "biometric-changed";

/** Minutes the app may sit backgrounded before a foreground re-lock kicks in. */
export const RESUME_RELOCK_AFTER_MS = 5 * 60 * 1000;

export interface BiometricCapability {
  /** Device has biometric hardware AND the user has enrolled at least one. */
  available: boolean;
  /**
   * Coarse biometry kind, used only for labelling. "face" / "fingerprint" /
   * "iris" map to Face ID / Touch ID / generic biometric copy.
   */
  kind: "face" | "fingerprint" | "iris" | "none";
}

/**
 * Decide whether the app-lock should engage for this launch / resume.
 *
 * Locking requires ALL of:
 *   - the feature flag is on (caller's responsibility — this fn assumes on),
 *   - the user is signed in (a session exists),
 *   - the user has not disabled the lock in settings,
 *   - the device actually has usable biometric hardware.
 *
 * Devices without biometric hardware fall through to `false` — they simply
 * stay signed in, per the brief's graceful-degradation requirement.
 */
export function shouldLock(args: {
  hasSession: boolean;
  preferenceEnabled: boolean;
  capability: BiometricCapability;
}): boolean {
  const { hasSession, preferenceEnabled, capability } = args;
  if (!hasSession) return false;
  if (!preferenceEnabled) return false;
  if (!capability.available) return false;
  // Belt-and-suspenders: native mapping should never emit available+none,
  // but treat that inconsistent state as "do not lock".
  if (capability.kind === "none") return false;
  return true;
}

/** Numeric biometry enum values from @capgo/capacitor-native-biometric. */
export type BiometryTypeValues = {
  NONE: number;
  FACE_ID: number;
  FACE_AUTHENTICATION: number;
  TOUCH_ID: number;
  FINGERPRINT: number;
  IRIS_AUTHENTICATION: number;
};

/**
 * Map the native plugin's `isAvailable()` payload into our capability shape.
 * Kept pure so unit tests can cover BiometryType.NONE without Capacitor.
 */
export function capabilityFromPluginResult(
  result: { isAvailable: boolean; biometryType: number },
  types: BiometryTypeValues,
): BiometricCapability {
  if (!result.isAvailable || result.biometryType === types.NONE) {
    return { available: false, kind: "none" };
  }

  let kind: BiometricCapability["kind"] = "fingerprint";
  switch (result.biometryType) {
    case types.FACE_ID:
    case types.FACE_AUTHENTICATION:
      kind = "face";
      break;
    case types.TOUCH_ID:
    case types.FINGERPRINT:
      kind = "fingerprint";
      break;
    case types.IRIS_AUTHENTICATION:
      kind = "iris";
      break;
    default:
      kind = "fingerprint";
  }
  return { available: true, kind };
}

/**
 * Given the timestamp the app was last backgrounded (or null if it was never
 * backgrounded this process), decide whether a foreground event should re-lock.
 * Returns false when the gap is under the threshold so quick app-switches do
 * not nag the user.
 */
export function shouldRelockOnResume(args: {
  backgroundedAt: number | null;
  now: number;
  thresholdMs?: number;
}): boolean {
  const { backgroundedAt, now, thresholdMs = RESUME_RELOCK_AFTER_MS } = args;
  if (backgroundedAt === null) return false;
  return now - backgroundedAt >= thresholdMs;
}

/**
 * The default value the `biometric_lock_enabled` preference takes the FIRST
 * time we read it for a signed-in user on a biometric-capable device. Per the
 * brief the toggle defaults ON, but only once the device is known capable —
 * on a non-capable device the stored value is irrelevant (shouldLock short-
 * circuits on capability anyway).
 */
export function defaultPreference(capability: BiometricCapability): boolean {
  return capability.available;
}

/**
 * Map a biometry kind to the user-facing toggle / button label.
 * iOS Face ID / Touch ID get their branded names; Android and unknown get the
 * generic "biometric unlock" wording.
 */
export function biometricLabel(
  kind: BiometricCapability["kind"],
  platform: "ios" | "android" | "web",
): string {
  if (platform === "ios") {
    if (kind === "face") return "Face ID";
    if (kind === "fingerprint") return "Touch ID";
  }
  return "biometric unlock";
}

/**
 * Classify the outcome of an `authenticateAsync`-style call. The native error
 * code for a changed/invalidated enrolment differs per platform, so we match
 * on a normalised set of substrings. A "biometric-changed" result must route
 * the user to a full password sign-in (the stored session can no longer be
 * trusted), whereas a plain failure just keeps the lock screen up.
 */
export function classifyAuthError(
  error: { code?: string; message?: string } | null,
): "cancelled" | "biometric-changed" | "failed" {
  if (!error) return "failed";
  const haystack = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    haystack.includes("invalidat") ||
    haystack.includes("biometrychanged") ||
    haystack.includes("keypermanentlyinvalidated") ||
    haystack.includes("enrollment") ||
    haystack.includes("enrolment")
  ) {
    return "biometric-changed";
  }
  if (
    haystack.includes("cancel") ||
    haystack.includes("usercancel") ||
    haystack.includes("16") // iOS LAError userCancel
  ) {
    return "cancelled";
  }
  return "failed";
}
