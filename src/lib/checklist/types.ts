/**
 * Active-job task checklist — items planned for a single booking shift.
 *
 * Lives in `bookings.task_checklist` (jsonb array). Either party can
 * add items; the carer typically marks them done as the shift unfolds.
 */

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
};

export const CHECKLIST_MAX_ITEMS = 25;
export const CHECKLIST_MAX_TEXT = 200;

export function newChecklistItem(text: string): ChecklistItem {
  // Stable client-side id; the DB never indexes these so collision
  // risk is acceptable. crypto.randomUUID is widely supported now.
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, text, done: false, done_at: null, done_by: null };
}

export function isChecklistItem(v: unknown): v is ChecklistItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.done === "boolean"
  );
}

export function sanitiseChecklist(input: unknown): ChecklistItem[] {
  if (!Array.isArray(input)) return [];
  const out: ChecklistItem[] = [];
  for (const v of input) {
    if (!isChecklistItem(v)) continue;
    const text = String(v.text).slice(0, CHECKLIST_MAX_TEXT).trim();
    if (!text) continue;
    out.push({
      id: String(v.id).slice(0, 64),
      text,
      done: Boolean(v.done),
      done_at:
        typeof v.done_at === "string" && v.done_at ? v.done_at : null,
      done_by:
        typeof v.done_by === "string" && v.done_by ? v.done_by : null,
    });
    if (out.length >= CHECKLIST_MAX_ITEMS) break;
  }
  return out;
}
