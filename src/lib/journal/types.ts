/**
 * Care journal types — kept in a separate file because both the
 * server data layer and the client components import them, and
 * client bundles must not pull in `next/headers` (which the server
 * helpers transitively require).
 */

export const JOURNAL_KINDS = [
  "note",
  "meal",
  "medication",
  "activity",
  "mood",
  "incident",
] as const;

export type JournalKind = (typeof JOURNAL_KINDS)[number];

export const JOURNAL_KIND_LABEL: Record<JournalKind, string> = {
  note: "Note",
  meal: "Meal",
  medication: "Medication",
  activity: "Activity",
  mood: "Mood",
  incident: "Incident",
};

/** Tone keys accepted by the shared `<Tag>` component. */
export const JOURNAL_KIND_TONE: Record<
  JournalKind,
  "primary" | "amber" | "green" | "red" | "neutral"
> = {
  note: "neutral",
  meal: "primary",
  medication: "primary",
  activity: "green",
  mood: "neutral",
  incident: "red",
};

export const JOURNAL_MOODS = [
  "calm",
  "engaged",
  "tired",
  "unsettled",
  "distressed",
] as const;

export type JournalMood = (typeof JOURNAL_MOODS)[number];

export const JOURNAL_MOOD_LABEL: Record<JournalMood, string> = {
  calm: "Calm",
  engaged: "Engaged",
  tired: "Tired",
  unsettled: "Unsettled",
  distressed: "Distressed",
};

export const JOURNAL_MOOD_EMOJI: Record<JournalMood, string> = {
  calm: "😌",
  engaged: "🙂",
  tired: "😴",
  unsettled: "😟",
  distressed: "😢",
};

/** Photo descriptor returned to the client — `path` is the storage object key,
 *  `url` is a freshly minted signed URL good for ~1h. */
export type JournalPhoto = {
  path: string;
  url: string;
};

export type JournalEntry = {
  id: string;
  author_id: string;
  booking_id: string | null;
  about_user_id: string | null;
  kind: JournalKind;
  mood: JournalMood | null;
  body: string;
  photos: JournalPhoto[];
  created_at: string;
  updated_at: string;
};

/** Maximum photos per entry — enforced both by DB CHECK and UI. */
export const JOURNAL_MAX_PHOTOS = 6;

/** Maximum body length — DB CHECK enforces 1..2000. */
export const JOURNAL_MAX_BODY = 2000;
