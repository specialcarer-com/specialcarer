"use client";

/**
 * Org-side wrapper around <TimesheetReviewCard /> — fetches the latest
 * row + pending adjustment from the API on mount and refreshes after
 * approve/adjust/dispute actions. Uses the same component the seeker
 * uses, with `isOrgView=true` so tips are hidden and copy adapts.
 *
 * Honours `?resume_payment=1` the same way the seeker page does — the
 * retry email link can deep-link an org owner straight into the Elements
 * step for any unconfirmed supplemental PIs.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  TimesheetReviewCard,
  type TimesheetRow,
  type PendingAdjustment,
} from "@/app/m/_components/TimesheetReviewCard";

export default function TimesheetSection({ bookingId }: { bookingId: string }) {
  const sp = useSearchParams();
  const [ts, setTs] = useState<TimesheetRow | null>(null);
  const [pending, setPending] = useState<PendingAdjustment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [resumePayment, setResumePayment] = useState(false);

  useEffect(() => {
    if (sp?.get("resume_payment") === "1") setResumePayment(true);
  }, [sp]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/m/bookings/${bookingId}/timesheet`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const j = (await res.json()) as {
        timesheet: TimesheetRow | null;
        pending_adjustment: PendingAdjustment | null;
      };
      setTs(j.timesheet ?? null);
      setPending(j.pending_adjustment ?? null);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [bookingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loaded || !ts) return null;
  return (
    <TimesheetReviewCard
      ts={ts}
      pendingAdjustment={pending}
      isOrgView={true}
      onChanged={refresh}
      resumePayment={resumePayment}
      onResumeConsumed={() => {
        setResumePayment(false);
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          if (url.searchParams.has("resume_payment")) {
            url.searchParams.delete("resume_payment");
            window.history.replaceState(null, "", url.toString());
          }
        }
      }}
    />
  );
}
