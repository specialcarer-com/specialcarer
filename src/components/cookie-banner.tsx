"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const COOKIE_NAME = "sc_consent";
const ONE_YEAR = 60 * 60 * 24 * 365;

type Choice = "accepted" | "rejected" | null;

function readChoice(): Choice {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )sc_consent=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return v === "accepted" || v === "rejected" ? v : null;
}

function writeChoice(choice: Exclude<Choice, null>) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(choice)}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax; Secure`;
}

/**
 * Compliance banner for UK PECR / EU ePrivacy Directive.
 *
 * Strictly necessary cookies are exempt; we only ask consent for the
 * single anonymous analytics cookie (sc_anon — see /cookies). The banner
 * is hidden once a choice has been recorded; users can change their mind
 * via the "Cookie settings" link in the footer (which simply clears the
 * sc_consent cookie and reloads).
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readChoice() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  function decide(choice: Exclude<Choice, null>) {
    writeChoice(choice);
    setVisible(false);
    // Hook for future analytics: only enable when accepted
    if (choice === "accepted") {
      window.dispatchEvent(new CustomEvent("sc:consent-accepted"));
    } else {
      window.dispatchEvent(new CustomEvent("sc:consent-rejected"));
    }
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md"
    >
      <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-5 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Cookies on SpecialCarer</p>
        <p className="mt-2">
          We use strictly necessary cookies to keep you signed in and the
          site secure. With your consent we also set one anonymous
          analytics cookie to help us improve the product. We do not run
          advertising cookies.
        </p>
        <p className="mt-2">
          See our{" "}
          <Link href="/cookies" className="text-brand underline">
            cookie notice
          </Link>{" "}
          for full details.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => decide("accepted")}
            className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600"
          >
            Accept analytics
          </button>
          <button
            onClick={() => decide("rejected")}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Strictly necessary only
          </button>
        </div>
      </div>
    </div>
  );
}
