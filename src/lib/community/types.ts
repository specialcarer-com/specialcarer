/**
 * Shared types for the carer community forum (3.10).
 */

export const FORUM_CATEGORIES = [
  "general",
  "tips",
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
  "safety_stories",
] as const;
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];

export const FORUM_CATEGORY_LABEL: Record<ForumCategory, string> = {
  general: "General",
  tips: "Tips & advice",
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
  safety_stories: "Safety stories",
};

export type ForumThread = {
  id: string;
  author_user_id: string;
  category: ForumCategory;
  title: string;
  body_md: string;
  is_pinned: boolean;
  is_locked: boolean;
  is_deleted: boolean;
  reply_count: number;
  last_post_at: string;
  created_at: string;
};

export type ForumThreadWithAuthor = ForumThread & {
  author_name: string | null;
};

export type ForumPost = {
  id: string;
  thread_id: string;
  author_user_id: string;
  body_md: string;
  is_deleted: boolean;
  created_at: string;
};

export type ForumPostWithAuthor = ForumPost & {
  author_name: string | null;
};

export const FORUM_REPORT_REASONS = [
  "spam",
  "harassment",
  "off_topic",
  "misinformation",
  "safety_concern",
  "other",
] as const;
export type ForumReportReason = (typeof FORUM_REPORT_REASONS)[number];

export const FORUM_REPORT_REASON_LABEL: Record<ForumReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  off_topic: "Off-topic",
  misinformation: "Misinformation",
  safety_concern: "Safety concern",
  other: "Other",
};

export const FORUM_REPORT_STATUSES = [
  "open",
  "dismissed",
  "actioned",
] as const;
export type ForumReportStatus = (typeof FORUM_REPORT_STATUSES)[number];

/** API-layer slow-mode: at most one post (thread or reply) per 30s. */
export const FORUM_SLOW_MODE_SECONDS = 30;

/** Edit window after which a thread/post can no longer be self-edited. */
export const FORUM_EDIT_WINDOW_MS = 30 * 60 * 1000;

export const FORUM_PAGE_SIZE = 20;
