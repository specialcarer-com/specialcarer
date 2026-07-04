"use client";

/**
 * AppLockToggle — the Profile › More row that turns the biometric app-lock on
 * and off. Rendered only when MOBILE_PERSISTENT_AUTH_ENABLED is on AND the
 * device actually has biometric hardware; on devices without biometrics the
 * row hides itself (there is nothing to toggle, and the brief asks those
 * devices to just stay signed in).
 *
 * The label is platform-aware: "Use Face ID" / "Use Touch ID" on iOS, "Use
 * biometric lock" on Android — driven by lock-native capability detection.
 */

import { useEffect, useState } from "react";
import { biometricLabel as labelFor } from "@/lib/mobile-auth/lock-core";
import {
  getBiometricCapability,
  getPlatform,
  readLockPreference,
  writeLockPreference,
} from "@/lib/mobile-auth/lock-native";

function IconFaceLock() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function AppLockToggle() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "web" | null>(
    null,
  );
  const [label, setLabel] = useState("biometric unlock");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const capability = await getBiometricCapability();
      const platformResult = await getPlatform();
      const pref = await readLockPreference();
      if (cancelled) return;
      setAvailable(capability.available);
      setPlatform(platformResult);
      const kindForLabel =
        platformResult === "ios" && capability.kind === "none"
          ? "face"
          : capability.kind;
      setLabel(labelFor(kindForLabel, platformResult));
      setEnabled(
        pref === null ? capability.available || platformResult === "ios" : pref,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (available === null || platform === null) return null;
  if (platform !== "ios" && !available) return null;

  // "Use Face ID" / "Use Touch ID" / "Use biometric lock".
  const rowLabel = `Use ${label === "biometric unlock" ? "biometric lock" : label}`;

  async function toggle() {
    if (busy) return;
    const next = !enabled;
    setBusy(true);

    if (next) {
      const { promptBiometric } = await import(
        "@/lib/mobile-auth/lock-native"
      );
      const result = await promptBiometric("Enable biometric app lock");
      if (result !== "ok") {
        setBusy(false);
        return;
      }
    }

    setEnabled(next);
    await writeLockPreference(next);
    setBusy(false);
  }

  return (
    <li className="border-t border-line">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        role="switch"
        aria-checked={enabled}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-muted/60 disabled:opacity-60"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-primary">
          <IconFaceLock />
        </span>
        <span className="flex-1 text-[14.5px] font-medium text-heading">
          {rowLabel}
        </span>
        <span
          aria-hidden="true"
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
    </li>
  );
}
