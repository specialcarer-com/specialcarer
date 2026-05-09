import Link from "next/link";
import type { ReactNode } from "react";
import { TopBar } from "../../_components/ui";

/**
 * Shared chrome for /m/org/* dashboard pages. The top section shows a
 * verification status banner; pages render their own body inside.
 */
export default function OrgShell({
  title,
  back,
  status,
  rejectionReason,
  children,
}: {
  title: string;
  back?: string;
  status: "draft" | "pending" | "verified" | "rejected" | "suspended";
  rejectionReason?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-bg-screen pb-12">
      <TopBar title={title} back={back ?? "/m/org"} />
      {status !== "verified" && (
        <div className="px-5 pt-3">
          <StatusBanner status={status} reason={rejectionReason} />
        </div>
      )}
      <div className="px-5 pt-3">{children}</div>
    </div>
  );
}

function StatusBanner({
  status,
  reason,
}: {
  status: "draft" | "pending" | "verified" | "rejected" | "suspended";
  reason?: string | null;
}) {
  if (status === "draft") {
    return (
      <div className="rounded-card bg-amber-50 border border-amber-200 p-3">
        <p className="text-[13px] font-semibold text-amber-900">
          Finish setting up
        </p>
        <p className="mt-1 text-[12px] text-amber-800">
          You haven&rsquo;t submitted for verification yet.{" "}
          <Link
            href="/m/org/register/step-1"
            className="font-semibold underline"
          >
            Resume registration
          </Link>
          .
        </p>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="rounded-card bg-amber-50 border border-amber-200 p-3">
        <p className="text-[13px] font-semibold text-amber-900">
          Account pending verification
        </p>
        <p className="mt-1 text-[12px] text-amber-800">
          Browse and shortlist now; booking opens once we&rsquo;ve reviewed
          your documents (usually 2 business days).
        </p>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="rounded-card bg-rose-50 border border-rose-200 p-3">
        <p className="text-[13px] font-semibold text-rose-900">
          We need a few changes
        </p>
        {reason && (
          <p className="mt-1 text-[12px] text-rose-800 whitespace-pre-wrap">
            {reason}
          </p>
        )}
        <p className="mt-1 text-[12px] text-rose-800">
          Update your details from the menu below — we&rsquo;ll review again
          within 2 business days.
        </p>
      </div>
    );
  }
  if (status === "suspended") {
    return (
      <div className="rounded-card bg-rose-50 border border-rose-200 p-3">
        <p className="text-[13px] font-semibold text-rose-900">
          Account suspended
        </p>
        <p className="mt-1 text-[12px] text-rose-800">
          Reach out to hello@specialcarer.com to discuss next steps.
        </p>
      </div>
    );
  }
  return null;
}
