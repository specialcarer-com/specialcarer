"use client";

/**
 * Carer home-screen DBS banner. Renders nothing when:
 *   - NEXT_PUBLIC_DBS_ENABLED is off, or
 *   - the carer's DBS is already approved.
 *
 * Otherwise prompts the carer to complete their DBS before accepting bookings.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { isDbsEnabled } from "@/lib/dbs/flag";

export default function DbsBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isDbsEnabled()) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/m/dbs/status");
        if (!res.ok) return;
        const data = await res.json();
        if (active && data?.overall_status !== "approved") setShow(true);
      } catch {
        // best-effort; banner stays hidden on error
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!isDbsEnabled() || !show) return null;

  return (
    <div className="px-4 mt-4">
      <Link
        href="/m/dbs"
        className="block rounded-card bg-amber-50 border border-amber-200 p-4 active:bg-amber-100"
      >
        <p className="text-[14px] font-semibold text-amber-900">
          Complete your DBS to start accepting bookings
        </p>
        <p className="mt-1 text-[12.5px] text-amber-800">
          Both Adult and Child DBS checks must be approved before you appear in
          search. Tap to view your status.
        </p>
      </Link>
    </div>
  );
}
