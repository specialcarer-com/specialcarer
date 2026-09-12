/**
 * Presentational SLA badge for the duty-of-candour + notifiable-event
 * admin UI (Phase C — PR C3b).
 *
 * Pure — no client state, no `use client`, no server calls. Takes a
 * `target_at` timestamp (nullable — `null` renders the "n/a" badge for
 * `type='other'` events with no statutory regulator clock) and a `now`
 * anchor and renders a coloured chip. Palette matches PR #221's admin
 * finance status pills:
 *   on-time   → neutral slate
 *   due-soon  → amber
 *   overdue   → red
 *   na        → grey
 *
 * The badge classification itself comes from `slaBadge(...)` in
 * `src/lib/candour/sla.ts` — this file just paints the outcome.
 *
 * Kept intentionally free of props like `size` or `variant` — the
 * queue-row and case-header call-sites want an identical chip.
 */
import { slaBadge, type SlaBadge as SlaBadgeState } from "@/lib/candour/sla";

type Props = {
  target_at: Date | null;
  now?: Date;
  /** Label shown before the classification, e.g. "Regulator notify". */
  label: string;
};

const CLASSES: Record<SlaBadgeState, string> = {
  "on-time":
    "bg-slate-100 text-slate-700 border-slate-200",
  "due-soon":
    "bg-amber-50 text-amber-800 border-amber-200",
  overdue: "bg-red-50 text-red-800 border-red-200",
  na: "bg-slate-50 text-slate-500 border-slate-200",
};

const STATE_LABEL: Record<SlaBadgeState, string> = {
  "on-time": "On time",
  "due-soon": "Due soon",
  overdue: "Overdue",
  na: "N/A",
};

export function SlaBadge({ target_at, now, label }: Props) {
  const state = slaBadge(target_at, now ?? new Date());
  const cls = CLASSES[state];
  const stateLabel = STATE_LABEL[state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cls}`}
      title={
        target_at
          ? `Target: ${target_at.toISOString()}`
          : "No statutory target (type='other')"
      }
    >
      <span className="text-slate-500">{label}</span>
      <span className="mx-1 text-slate-300">·</span>
      <span>{stateLabel}</span>
    </span>
  );
}

export default SlaBadge;
