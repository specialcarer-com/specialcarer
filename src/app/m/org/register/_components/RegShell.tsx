"use client";

/**
 * Shell for the 9-step organisation registration flow.
 * Renders the step progress bar + page title in the same way for
 * every step, so each step page only worries about its own form.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { TopBar } from "../../../_components/ui";

const STEP_LABELS = [
  "Why",
  "Country",
  "Identity",
  "Sector",
  "Your role",
  "Billing",
  "Documents",
  "Review",
  "Done",
];

export default function RegShell({
  step,
  title,
  subtitle,
  back,
  children,
}: {
  step: number; // 1..9
  title: string;
  subtitle?: string;
  back?: string;
  children: ReactNode;
}) {
  const total = STEP_LABELS.length;
  return (
    <div className="min-h-[100dvh] bg-bg-screen pb-12">
      <TopBar title={`Step ${step} of ${total}`} back={back ?? "/m/sign-up"} />
      <div className="px-5 pt-2">
        <div className="flex h-1.5 gap-1.5">
          {STEP_LABELS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i + 1 <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-[18px] font-bold text-heading">{title}</p>
        {subtitle && (
          <p className="mt-1 text-[13px] text-subheading">{subtitle}</p>
        )}
      </div>
      <div className="px-5 pt-4">{children}</div>
      <p className="mt-8 text-center text-[11px] text-subheading">
        Need to come back later? Your progress is saved automatically.{" "}
        <Link href="/m/org" className="text-primary font-semibold">
          Go to dashboard
        </Link>
      </p>
    </div>
  );
}
