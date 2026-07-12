"use client";

/**
 * LockScreen — full-bleed brand-teal overlay shown while the biometric app-lock
 * is engaged. It covers the entire app (the provider renders it INSTEAD of the
 * page children) so no authenticated content is ever painted behind it.
 *
 * It is intentionally dumb: all decision logic lives in the
 * BiometricLockProvider. This component only renders state and forwards two
 * intents — "unlock" (re-prompt biometric) and "password" (abandon biometric,
 * sign in with a password instead).
 */

import type { LockReason } from "@/lib/mobile-auth/lock-core";

export interface LockScreenProps {
  reason: LockReason;
  /** Branded action label, e.g. "Face ID" / "Touch ID" / "biometric unlock". */
  biometricLabel: string;
  /** True while an OS biometric prompt is in flight (disables the buttons). */
  prompting: boolean;
  /** True after a failed attempt — surfaces the "try again / use password" copy. */
  failed: boolean;
  onUnlock: () => void;
  onUsePassword: () => void;
}

export default function LockScreen({
  reason,
  biometricLabel,
  prompting,
  failed,
  onUnlock,
  onUsePassword,
}: LockScreenProps) {
  const heading =
    reason === "biometric-changed"
      ? "Please sign in again"
      : "Welcome back";

  const body =
    reason === "biometric-changed"
      ? "Your device biometrics changed, so we need you to sign in with your password to keep your account secure."
      : failed
        ? `Couldn’t verify it’s you. Try ${biometricLabel} again, or sign in with your password.`
        : `Unlock with ${biometricLabel} to continue.`;

  const showUnlock = reason !== "biometric-changed";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App locked"
      className="fixed inset-0 z-[10001] flex flex-col items-center justify-center bg-primary px-8 text-center text-white"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="grid h-20 w-20 place-items-center rounded-full bg-white/15">
        <LockGlyph />
      </div>

      <h1 className="mt-6 text-[22px] font-extrabold">{heading}</h1>
      <p className="mt-2 max-w-[18rem] text-[14.5px] leading-relaxed text-white/85">
        {body}
      </p>

      <div className="mt-8 flex w-full max-w-[18rem] flex-col gap-3">
        {showUnlock && (
          <button
            type="button"
            onClick={onUnlock}
            disabled={prompting}
            className="inline-flex h-12 items-center justify-center rounded-pill bg-white px-6 text-[15px] font-bold text-primary disabled:opacity-60"
          >
            {prompting
              ? "Verifying…"
              : failed
                ? `Try ${biometricLabel} again`
                : `Unlock with ${biometricLabel}`}
          </button>
        )}
        <button
          type="button"
          onClick={onUsePassword}
          disabled={prompting}
          className="inline-flex h-12 items-center justify-center rounded-pill border border-white/40 px-6 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          Sign in with password instead
        </button>
      </div>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg
      width="34"
      height="34"
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
