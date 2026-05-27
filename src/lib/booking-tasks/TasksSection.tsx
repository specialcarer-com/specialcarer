"use client";

/**
 * Reusable task checklist section. Used on both the carer's targeted
 * job page (interactive) and the seeker's booking detail page
 * (read-only mirror). Look & feel: cream `#F4EFE6` section background,
 * teal `#039EA0` accents, Plus Jakarta Sans, 44px tap targets.
 */

import { useEffect, useState } from "react";
import { useBookingTasks } from "./useBookingTasks";

const TEAL = "#039EA0";
const CREAM = "#F4EFE6";
const INK = "#0F1416";
const SUB = "#575757";
const BORDER = "#D4D1CA";

export type TasksSectionProps = {
  bookingId: string;
  /** Carer's auth user id (used for optimistic done_by stamping). */
  currentUserId?: string | null;
  /** Seeker side renders the checklist as a read-only mirror. */
  readOnly?: boolean;
  /** Visual header label. Defaults to "Tasks" (carer) / "Progress" (seeker). */
  title?: string;
};

export function TasksSection({
  bookingId,
  currentUserId,
  readOnly = false,
  title,
}: TasksSectionProps) {
  const { status, tasks, toggle, progress } = useBookingTasks(bookingId, {
    currentUserId,
    readOnly,
  });
  const [error, setError] = useState<string | null>(null);

  // Try to fire a light haptic on each carer toggle. We only do this on
  // the carer side and only if the runtime exposes a vibration hook —
  // expo-haptics is not a repo dep and we don't want to add one.
  const haptic = () => {
    if (readOnly) return;
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        navigator.vibrate(10);
      }
    } catch {
      /* ignore */
    }
  };

  // Auto-dismiss errors after a few seconds so the toast doesn't camp.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  if (status === "loading") {
    return (
      <section
        className="rounded-card p-4"
        style={{ background: CREAM, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        <p className="text-[14px]" style={{ color: SUB }}>
          Loading tasks…
        </p>
      </section>
    );
  }

  const headerLabel = title ?? (readOnly ? "Progress" : "Tasks");

  return (
    <section
      className="rounded-card p-4 space-y-3"
      style={{ background: CREAM, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      aria-label={headerLabel}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold" style={{ color: INK }}>
          {headerLabel}
        </h2>
        {progress.total > 0 && (
          <span
            className="text-[12px] font-semibold rounded-pill px-2.5 py-0.5"
            style={{
              background: "white",
              color: TEAL,
              border: `1px solid ${BORDER}`,
            }}
          >
            {progress.done} of {progress.total} complete
          </span>
        )}
      </header>

      {tasks.length === 0 ? (
        <p className="text-[13px]" style={{ color: SUB }}>
          No tasks yet — your booking notes will appear here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => {
            const checkboxId = `task-${t.id}`;
            const interactive = !readOnly;
            const onClick = async () => {
              if (!interactive) return;
              haptic();
              try {
                await toggle(t.id, !t.done);
              } catch {
                setError("Couldn't update — please try again.");
              }
            };
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={onClick}
                  disabled={!interactive}
                  aria-pressed={t.done}
                  className="w-full min-h-[44px] flex items-center gap-3 px-2 py-2 rounded-btn text-left"
                  style={{
                    background: "white",
                    border: `1px solid ${BORDER}`,
                    cursor: interactive ? "pointer" : "default",
                  }}
                >
                  <span
                    id={checkboxId}
                    aria-hidden="true"
                    className="inline-flex items-center justify-center shrink-0 w-6 h-6 rounded-md"
                    style={{
                      border: `2px solid ${t.done ? TEAL : BORDER}`,
                      background: t.done ? TEAL : "white",
                      color: "white",
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {t.done ? "\u2713" : ""}
                  </span>
                  <span
                    className="text-[14px] leading-snug"
                    style={{
                      color: t.done ? SUB : INK,
                      textDecoration: t.done ? "line-through" : "none",
                    }}
                  >
                    {t.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p
          role="alert"
          className="text-[12px] font-semibold"
          style={{ color: "#C22" }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
