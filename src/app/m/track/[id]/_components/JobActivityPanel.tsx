"use client";

/**
 * Active-job panel — shown on /m/track/[id] for both parties.
 *
 *  • Shift checklist:   editable for carer + seeker; family viewers read-only.
 *      - Add task, toggle done, remove. Persisted in `bookings.task_checklist`.
 *  • Quick log buttons: carer-only writes that POST to /api/journal with a
 *      preset `kind` and a sensible default body. Photos for the "Photo" log
 *      are uploaded direct to the journal-photos bucket then attached.
 *  • Activity feed:     last 20 journal entries for this booking, visible to
 *      both. Auto-refreshes every 12s while mounted.
 *
 * Design principles:
 *  • One-tap quick-logs (no modal blocking) — tapping Meds writes "Medication
 *    given" and shows the entry in the feed immediately.
 *  • Optimistic UI for checklist toggles; rolls back on error.
 *  • Read-only when role==="seeker" (no write controls rendered).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Button,
  Input,
  Tag,
  IconCheck,
  IconPlus,
  IconCamera,
  IconJournal,
  IconTrash,
} from "../../../_components/ui";
import {
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_MAX_TEXT,
  newChecklistItem,
  type ChecklistItem,
} from "@/lib/checklist/types";
import {
  JOURNAL_KIND_LABEL,
  JOURNAL_KIND_TONE,
  type JournalEntry,
  type JournalKind,
} from "@/lib/journal/types";
import { createClient } from "@/lib/supabase/client";

type Props = {
  bookingId: string;
  role: "seeker" | "caregiver";
};

type QuickLog = {
  kind: JournalKind;
  label: string;
  body: string;
};

const QUICK_LOGS: QuickLog[] = [
  { kind: "medication", label: "Meds", body: "Medication given." },
  { kind: "meal", label: "Meal", body: "Meal/snack offered." },
  { kind: "activity", label: "Nap / rest", body: "Settled for a nap or rest." },
  { kind: "incident", label: "Incident", body: "Incident logged — see notes." },
];

const REFRESH_MS = 12_000;
const PHOTOS_BUCKET = "journal-photos";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function JobActivityPanel({ bookingId, role }: Props) {
  const isCarer = role === "caregiver";

  // ───── Checklist state ─────
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newText, setNewText] = useState("");
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  // ───── Activity feed state ─────
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [posting, setPosting] = useState<JournalKind | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  // ───── Photo input ref (carer-only) ─────
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Initial load + polling.
  const refreshFeed = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/journal?bookingId=${encodeURIComponent(bookingId)}&limit=20`,
        { cache: "no-store" },
      );
      if (!r.ok) return;
      const j = (await r.json()) as { entries: JournalEntry[] };
      setEntries(j.entries ?? []);
    } catch {
      // ignore
    }
  }, [bookingId]);

  const refreshChecklist = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/bookings/${encodeURIComponent(bookingId)}/checklist`,
        { cache: "no-store" },
      );
      if (!r.ok) return;
      const j = (await r.json()) as { items: ChecklistItem[] };
      setItems(j.items ?? []);
    } catch {
      // ignore
    }
  }, [bookingId]);

  useEffect(() => {
    refreshFeed();
    refreshChecklist();
    const id = setInterval(refreshFeed, REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshFeed, refreshChecklist]);

  // ───── Checklist actions ─────
  const persistChecklist = useCallback(
    async (next: ChecklistItem[]) => {
      setSavingChecklist(true);
      setChecklistError(null);
      try {
        const r = await fetch(
          `/api/bookings/${encodeURIComponent(bookingId)}/checklist`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ items: next }),
          },
        );
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(j.error ?? "Couldn't save checklist.");
        }
        const j = (await r.json()) as { items: ChecklistItem[] };
        setItems(j.items ?? next);
      } catch (e) {
        setChecklistError(
          e instanceof Error ? e.message : "Couldn't save checklist.",
        );
        // Roll back to server state.
        refreshChecklist();
      } finally {
        setSavingChecklist(false);
      }
    },
    [bookingId, refreshChecklist],
  );

  const addItem = useCallback(() => {
    const text = newText.trim().slice(0, CHECKLIST_MAX_TEXT);
    if (!text) return;
    if (items.length >= CHECKLIST_MAX_ITEMS) {
      setChecklistError(
        `Max ${CHECKLIST_MAX_ITEMS} tasks per shift.`,
      );
      return;
    }
    const next = [...items, newChecklistItem(text)];
    setItems(next); // optimistic
    setNewText("");
    persistChecklist(next);
  }, [items, newText, persistChecklist]);

  const toggleItem = useCallback(
    (id: string) => {
      const next = items.map((it) =>
        it.id === id
          ? {
              ...it,
              done: !it.done,
              done_at: !it.done ? new Date().toISOString() : null,
            }
          : it,
      );
      setItems(next); // optimistic
      persistChecklist(next);
    },
    [items, persistChecklist],
  );

  const removeItem = useCallback(
    (id: string) => {
      const next = items.filter((it) => it.id !== id);
      setItems(next); // optimistic
      persistChecklist(next);
    },
    [items, persistChecklist],
  );

  // ───── Quick-log actions ─────
  const postEntry = useCallback(
    async (q: QuickLog, photoPaths: string[] = []) => {
      setPosting(q.kind);
      setFeedError(null);
      try {
        const r = await fetch("/api/journal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bookingId,
            kind: q.kind,
            body: q.body,
            photoPaths,
          }),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(j.error ?? "Couldn't save log.");
        }
        await refreshFeed();
      } catch (e) {
        setFeedError(
          e instanceof Error ? e.message : "Couldn't save log.",
        );
      } finally {
        setPosting(null);
      }
    },
    [bookingId, refreshFeed],
  );

  const onPickPhoto = useCallback(
    async (file: File) => {
      setUploadingPhoto(true);
      setFeedError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Please sign in again.");
        const ext = (file.name.split(".").pop() ?? "jpg")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 5) || "jpg";
        const path = `${user.id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });
        if (upErr) throw new Error(upErr.message);
        await postEntry(
          {
            kind: "note",
            label: "Photo",
            body: "Photo logged from on-shift.",
          },
          [path],
        );
      } catch (e) {
        setFeedError(
          e instanceof Error ? e.message : "Photo upload failed.",
        );
      } finally {
        setUploadingPhoto(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [postEntry, supabase],
  );

  // ───── Render ─────
  return (
    <div className="space-y-4">
      {/* Shift checklist */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-heading">
            Shift checklist
          </h3>
          <span className="text-[11px] text-subhead">
            {items.filter((i) => i.done).length}/{items.length} done
          </span>
        </div>

        {items.length === 0 ? (
          <p className="text-[13px] text-subhead">
            No tasks yet. {isCarer ? "Add what's planned for this shift." : "The carer will add tasks here."}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(it.id)}
                  disabled={savingChecklist}
                  aria-label={it.done ? "Mark not done" : "Mark done"}
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                    it.done
                      ? "bg-primary border-primary text-white"
                      : "border-line text-transparent"
                  }`}
                >
                  <IconCheck />
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13px] leading-snug ${
                      it.done ? "text-subhead line-through" : "text-heading"
                    }`}
                  >
                    {it.text}
                  </p>
                  {it.done && it.done_at && (
                    <p className="text-[11px] text-subhead">
                      Done {formatTime(it.done_at)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  disabled={savingChecklist}
                  aria-label="Remove task"
                  className="text-subhead hover:text-rose-600"
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Add a task…"
            maxLength={CHECKLIST_MAX_TEXT}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
          />
          <Button
            type="button"
            onClick={addItem}
            disabled={savingChecklist || !newText.trim()}
            aria-label="Add task"
          >
            <span className="inline-flex items-center gap-1">
              <IconPlus /> Add
            </span>
          </Button>
        </div>
        {checklistError && (
          <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
            {checklistError}
          </p>
        )}
      </Card>

      {/* Quick-log — carer only */}
      {isCarer && (
        <Card className="p-4 space-y-3">
          <h3 className="text-[14px] font-bold text-heading">Quick log</h3>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_LOGS.map((q) => (
              <Button
                key={q.kind}
                type="button"
                variant="outline"
                onClick={() => postEntry(q)}
                disabled={posting !== null || uploadingPhoto}
              >
                {posting === q.kind ? "Logging…" : q.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={posting !== null || uploadingPhoto}
            >
              <span className="inline-flex items-center gap-1">
                <IconCamera />
                {uploadingPhoto ? "Uploading…" : "Photo"}
              </span>
            </Button>
            <a
              href={`/m/journal/new?bookingId=${encodeURIComponent(bookingId)}`}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-line bg-white px-3 h-11 text-[14px] font-semibold text-heading"
            >
              <IconJournal /> Note
            </a>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickPhoto(f);
            }}
          />
          {feedError && (
            <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
              {feedError}
            </p>
          )}
        </Card>
      )}

      {/* Activity feed */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-heading">Activity</h3>
          <a
            href={`/m/journal?bookingId=${encodeURIComponent(bookingId)}`}
            className="text-[12px] font-semibold text-primary"
          >
            See all
          </a>
        </div>
        {entries.length === 0 ? (
          <p className="text-[13px] text-subhead">
            No activity yet. {isCarer ? "Tap a quick-log to start." : "The carer will post updates here."}
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <div className="mt-1">
                  <Tag tone={JOURNAL_KIND_TONE[e.kind]}>
                    {JOURNAL_KIND_LABEL[e.kind]}
                  </Tag>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-heading leading-snug whitespace-pre-wrap">
                    {e.body}
                  </p>
                  {e.photos.length > 0 && (
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {e.photos.slice(0, 4).map((p) =>
                        p.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={p.path}
                            src={p.url}
                            alt=""
                            className="h-14 w-14 rounded-lg object-cover border border-line"
                          />
                        ) : null,
                      )}
                    </div>
                  )}
                  <p className="text-[11px] text-subhead mt-0.5">
                    {formatTime(e.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
