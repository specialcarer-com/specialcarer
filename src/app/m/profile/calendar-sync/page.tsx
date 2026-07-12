"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TopBar, Button, Card } from "../../_components/ui";
import type { CalendarFeedStatus } from "@/app/api/m/profile/calendar-feed/route";

/**
 * Calendar sync settings — /m/profile/calendar-sync (gap 40).
 *
 * Personal calendar feed controls:
 *   - no token yet → "Set up calendar sync" (calls rotate)
 *   - token exists → masked URL (reveal on tap), copy, open-in-calendar,
 *     rotate, and disable.
 *
 * The webcal:// URL is private — anyone with it can read the user's upcoming
 * bookings — so it's masked by default and rotating invalidates the old one.
 */
export default function CalendarSyncPage() {
  const t = useTranslations("calendar");
  const [status, setStatus] = useState<CalendarFeedStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/m/profile/calendar-feed", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) setStatus((await res.json()) as CalendarFeedStatus);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotate() {
    setBusy(true);
    setCopied(false);
    try {
      const res = await fetch("/api/m/profile/calendar-feed/rotate", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const j = (await res.json()) as { url: string };
        setStatus({ enabled: true, url: j.url });
        setRevealed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const res = await fetch("/api/m/profile/calendar-feed/disable", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setStatus({ enabled: false, url: null });
        setRevealed(false);
        setCopied(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!status?.url) return;
    try {
      await navigator.clipboard.writeText(status.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — reveal so the user can copy manually */
      setRevealed(true);
    }
  }

  // Mask all but the scheme + last 4 chars of the token.
  const masked = status?.url
    ? status.url.replace(/([0-9a-f-]{8,})(?=\.ics$)/i, (m) => "••••" + m.slice(-4))
    : "";
  const httpUrl = status?.url?.replace(/^webcal:\/\//, "https://") ?? "";

  return (
    <div className="min-h-screen bg-bg-screen">
      <TopBar title={t("syncTitle")} back="/m/profile" />

      <div className="px-5 pt-4 pb-16 space-y-4">
        <p className="text-[13px] text-subheading leading-relaxed">
          {t("syncIntro")}
        </p>

        {!loaded ? (
          <div className="h-28 rounded-card bg-muted animate-pulse" />
        ) : status?.enabled && status.url ? (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-1">
              {t("yourFeedUrl")}
            </p>
            <p className="text-[12px] text-subheading mb-3 leading-snug">
              {t("feedUrlHelp")}
            </p>

            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="w-full break-all rounded-btn bg-muted px-3 py-2.5 text-left text-[12.5px] font-mono text-heading"
              aria-label={revealed ? t("hideUrl") : t("revealUrl")}
            >
              {revealed ? status.url : masked}
            </button>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" onClick={copy}>
                {copied ? t("copied") : t("copyUrl")}
              </Button>
              <a href={httpUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" block>
                  {t("openInCalendar")}
                </Button>
              </a>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={rotate}
                disabled={busy}
              >
                {t("rotateUrl")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={disable}
                disabled={busy}
              >
                {t("disable")}
              </Button>
            </div>

            <p className="mt-3 text-[11.5px] text-subheading leading-relaxed">
              {t("rotateHelp")}
            </p>
          </Card>
        ) : (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-1">
              {t("setupTitle")}
            </p>
            <p className="text-[12px] text-subheading mb-3 leading-snug">
              {t("setupHelp")}
            </p>
            <Button size="sm" block onClick={rotate} disabled={busy}>
              {t("setup")}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
