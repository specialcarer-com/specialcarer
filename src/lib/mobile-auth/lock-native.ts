/**
 * Side-effecting adapters for the mobile biometric app-lock. Everything that
 * touches Capacitor plugins lives here so the decision logic in `lock-core.ts`
 * stays pure and unit-testable.
 *
 * All Capacitor modules are dynamically imported so this file is safe to load
 * in a plain web browser (and in SSR): on a non-native platform every export
 * resolves to a graceful no-op / not-available result.
 */

import type { BiometricCapability } from "./lock-core";
import { classifyAuthError } from "./lock-core";

const PREF_KEY = "biometric_lock_enabled";
// Logical "server" namespace the credential is filed under by the biometric
// plugin. Not security-sensitive — just a bucket key.
const CREDENTIAL_SERVER = "com.specialcarer.app";

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function getPlatform(): Promise<"ios" | "android" | "web"> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return p;
  } catch {
    /* not native */
  }
  return "web";
}

/**
 * Query biometric hardware + enrolment. Returns { available:false } on web,
 * on devices with no sensor, or when no biometric is enrolled — the caller
 * (shouldLock) treats all of those as "do not lock".
 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (!(await isNative())) return { available: false, kind: "none" };
  try {
    const { NativeBiometric, BiometryType } = await import(
      "@capgo/capacitor-native-biometric"
    );
    const result = await NativeBiometric.isAvailable();
    if (!result.isAvailable) return { available: false, kind: "none" };

    let kind: BiometricCapability["kind"] = "fingerprint";
    switch (result.biometryType) {
      case BiometryType.FACE_ID:
      case BiometryType.FACE_AUTHENTICATION:
        kind = "face";
        break;
      case BiometryType.TOUCH_ID:
      case BiometryType.FINGERPRINT:
        kind = "fingerprint";
        break;
      case BiometryType.IRIS_AUTHENTICATION:
        kind = "iris";
        break;
      default:
        kind = "fingerprint";
    }
    return { available: true, kind };
  } catch {
    // Plugin not installed in this build → behave as no biometric.
    return { available: false, kind: "none" };
  }
}

/**
 * Prompt the OS biometric sheet. Resolves to:
 *   "ok"                — user authenticated
 *   "cancelled"         — user dismissed; keep lock screen up
 *   "biometric-changed" — enrolment changed/invalidated; force password sign-in
 *   "failed"            — generic failure after OS retries
 *
 * On a non-native platform this resolves "ok" so the web build never gets
 * stuck behind a lock that can never be satisfied.
 */
export async function promptBiometric(
  reasonLabel: string,
): Promise<"ok" | "cancelled" | "biometric-changed" | "failed"> {
  if (!(await isNative())) return "ok";
  try {
    const { NativeBiometric } = await import(
      "@capgo/capacitor-native-biometric"
    );
    await NativeBiometric.verifyIdentity({
      reason: reasonLabel,
      title: "Unlock SpecialCarer",
      subtitle: reasonLabel,
    });
    return "ok";
  } catch (err) {
    return classifyAuthError(
      err as { code?: string; message?: string } | null,
    );
  }
}

// ─── preference storage (Capacitor Preferences → Keychain/Keystore-backed) ───

export async function readLockPreference(): Promise<boolean | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: PREF_KEY });
    if (value === null) return null;
    return value === "true";
  } catch {
    return null;
  }
}

export async function writeLockPreference(enabled: boolean): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: PREF_KEY, value: String(enabled) });
  } catch {
    /* best-effort */
  }
}

/**
 * Clear the app-lock preference on sign-out, per the brief (signing out wipes
 * the biometric setting so the next user starts fresh). The Supabase session
 * cookie is cleared separately by supabase.auth.signOut().
 */
export async function clearLockPreference(): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: PREF_KEY });
  } catch {
    /* best-effort */
  }
  try {
    const { NativeBiometric } = await import(
      "@capgo/capacitor-native-biometric"
    );
    await NativeBiometric.deleteCredentials({ server: CREDENTIAL_SERVER });
  } catch {
    /* no stored credential / plugin absent */
  }
}
