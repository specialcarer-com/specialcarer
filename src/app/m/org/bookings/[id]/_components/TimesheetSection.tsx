"use client";

/**
 * Org-side wrapper around <TimesheetReviewCard /> — fetches the latest
 * row + pending adjustment from the API on mount and refreshes after
 * approve/adjust/dispute actions. Uses the same component the seeker
 * uses, with `isOrgView=true` so tips are hidden and copy adapts.
 */
import { useCallback, useEffect, useState } from "react";
import {
  TimesheetReviewCard,
  type TimesheetRow,
  type PendingAdjustment,
} from "@/app/m/_components/TimesheetReviewCard";

export default function TimesheetSection({ bookingId }: { bookingId: string }) {
  const [ts, setTs] = useState<TimesheetRow | null>(null);
  const [pending, setPending] = useState<PendingAdjustment | null>(null);
  const [loaded, setLoaded] = useState(false);

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
    />
  );
}
