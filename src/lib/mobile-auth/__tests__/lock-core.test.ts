/**
 * Unit tests for the pure biometric app-lock decision logic. No Capacitor or
 * DOM is touched here — these functions are deliberately side-effect free so
 * the lock state machine can be verified with the plain node:test runner.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldLock,
  shouldRelockOnResume,
  defaultPreference,
  biometricLabel,
  classifyAuthError,
  capabilityFromPluginResult,
  RESUME_RELOCK_AFTER_MS,
  type BiometricCapability,
} from "../lock-core";

const CAPABLE: BiometricCapability = { available: true, kind: "face" };
const NOT_CAPABLE: BiometricCapability = { available: false, kind: "none" };

describe("shouldLock", () => {
  it("locks when signed in, preference on, and biometric available", () => {
    assert.equal(
      shouldLock({
        hasSession: true,
        preferenceEnabled: true,
        capability: CAPABLE,
      }),
      true,
    );
  });

  it("does not lock when there is no session", () => {
    assert.equal(
      shouldLock({
        hasSession: false,
        preferenceEnabled: true,
        capability: CAPABLE,
      }),
      false,
    );
  });

  it("does not lock when the user disabled the toggle", () => {
    assert.equal(
      shouldLock({
        hasSession: true,
        preferenceEnabled: false,
        capability: CAPABLE,
      }),
      false,
    );
  });

  it("falls through (no lock) on devices without biometric hardware", () => {
    assert.equal(
      shouldLock({
        hasSession: true,
        preferenceEnabled: true,
        capability: NOT_CAPABLE,
      }),
      false,
    );
  });

  it("does not lock when kind is none even if available is true", () => {
    assert.equal(
      shouldLock({
        hasSession: true,
        preferenceEnabled: true,
        capability: { available: true, kind: "none" },
      }),
      false,
    );
  });
});

describe("shouldRelockOnResume", () => {
  it("does not relock when the app was never backgrounded", () => {
    assert.equal(
      shouldRelockOnResume({ backgroundedAt: null, now: 1_000 }),
      false,
    );
  });

  it("does not relock for a quick app-switch under the threshold", () => {
    const now = 10 * 60 * 1000;
    const backgroundedAt = now - (RESUME_RELOCK_AFTER_MS - 1);
    assert.equal(shouldRelockOnResume({ backgroundedAt, now }), false);
  });

  it("relocks once the background gap reaches the threshold", () => {
    const now = 10 * 60 * 1000;
    const backgroundedAt = now - RESUME_RELOCK_AFTER_MS;
    assert.equal(shouldRelockOnResume({ backgroundedAt, now }), true);
  });

  it("relocks for a long background gap", () => {
    assert.equal(
      shouldRelockOnResume({ backgroundedAt: 0, now: 60 * 60 * 1000 }),
      true,
    );
  });

  it("honours a custom threshold", () => {
    assert.equal(
      shouldRelockOnResume({ backgroundedAt: 0, now: 1000, thresholdMs: 500 }),
      true,
    );
    assert.equal(
      shouldRelockOnResume({ backgroundedAt: 0, now: 400, thresholdMs: 500 }),
      false,
    );
  });
});

describe("defaultPreference", () => {
  it("defaults ON for biometric-capable devices", () => {
    assert.equal(defaultPreference(CAPABLE), true);
  });
  it("defaults OFF (irrelevant) for non-capable devices", () => {
    assert.equal(defaultPreference(NOT_CAPABLE), false);
  });
});

describe("biometricLabel", () => {
  it("maps face → Face ID on iOS", () => {
    assert.equal(biometricLabel("face", "ios"), "Face ID");
  });
  it("maps fingerprint → Touch ID on iOS", () => {
    assert.equal(biometricLabel("fingerprint", "ios"), "Touch ID");
  });
  it("uses generic copy on Android regardless of kind", () => {
    assert.equal(biometricLabel("fingerprint", "android"), "biometric unlock");
    assert.equal(biometricLabel("face", "android"), "biometric unlock");
  });
  it("uses generic copy on web", () => {
    assert.equal(biometricLabel("face", "web"), "biometric unlock");
  });
});

describe("capabilityFromPluginResult", () => {
  const TYPES = {
    NONE: 0,
    TOUCH_ID: 1,
    FACE_ID: 2,
    FINGERPRINT: 3,
    FACE_AUTHENTICATION: 4,
    IRIS_AUTHENTICATION: 5,
  };

  it("returns available:false when biometryType is NONE even if isAvailable is true", () => {
    assert.deepEqual(
      capabilityFromPluginResult(
        { isAvailable: true, biometryType: TYPES.NONE },
        TYPES,
      ),
      { available: false, kind: "none" },
    );
  });

  it("maps Face ID to face kind", () => {
    assert.deepEqual(
      capabilityFromPluginResult(
        { isAvailable: true, biometryType: TYPES.FACE_ID },
        TYPES,
      ),
      { available: true, kind: "face" },
    );
  });
});

describe("classifyAuthError", () => {
  it("treats a null error as a generic failure", () => {
    assert.equal(classifyAuthError(null), "failed");
  });

  it("detects an invalidated enrolment as biometric-changed", () => {
    assert.equal(
      classifyAuthError({ code: "KeyPermanentlyInvalidatedException" }),
      "biometric-changed",
    );
    assert.equal(
      classifyAuthError({ message: "Biometry has changed since enrollment" }),
      "biometric-changed",
    );
  });

  it("detects a user cancellation", () => {
    assert.equal(
      classifyAuthError({ code: "userCancel", message: "User cancelled" }),
      "cancelled",
    );
  });

  it("falls back to failed for an unrecognised error", () => {
    assert.equal(
      classifyAuthError({ code: "10", message: "no match" }),
      "failed",
    );
  });
});
