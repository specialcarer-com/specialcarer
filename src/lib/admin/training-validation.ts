/**
 * Validation helpers for the admin Training Hub CRUD surfaces.
 * No external deps — plain TS, mirrors the style of the rest of the codebase.
 */

import { COVERAGE_VERTICALS, type CoverageVertical } from "@/lib/coverage-types";

export const TRAINING_CATEGORIES = [
  "clinical",
  "behavioural",
  "operational",
  "compliance",
] as const;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

export const TRAINING_COUNTRY_SCOPES = ["UK", "US", "both"] as const;
export type TrainingCountryScope = (typeof TRAINING_COUNTRY_SCOPES)[number];

export const TRAINING_VIDEO_PROVIDERS = ["embed", "mp4", "youtube"] as const;
export type TrainingVideoProvider = (typeof TRAINING_VIDEO_PROVIDERS)[number];

export const TRAINING_VERTICALS = COVERAGE_VERTICALS;
export type TrainingVertical = CoverageVertical;

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

/**
 * Sentinel "draft" timestamp. training_courses.published_at is NOT NULL
 * (DB default now()), so we mark drafts with a far-future date. The
 * existing RLS policy hides anything where published_at > now(), so this
 * achieves the same outcome as nulling the column would have.
 */
export const DRAFT_FUTURE = "9999-12-31T00:00:00.000Z";

/** True when published_at is non-null and in the past. */
export function isPublished(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  return new Date(publishedAt) <= new Date();
}

export type CourseInput = {
  slug?: unknown;
  title?: unknown;
  summary?: unknown;
  category?: unknown;
  is_required?: unknown;
  ceu_credits?: unknown;
  video_url?: unknown;
  video_provider?: unknown;
  transcript_md?: unknown;
  duration_minutes?: unknown;
  country_scope?: unknown;
  required_for_verticals?: unknown;
  sort_order?: unknown;
};

export type ValidatedCourse = {
  slug: string;
  title: string;
  summary: string;
  category: TrainingCategory;
  is_required: boolean;
  ceu_credits: number;
  video_url: string | null;
  video_provider: TrainingVideoProvider;
  transcript_md: string | null;
  duration_minutes: number;
  country_scope: TrainingCountryScope;
  required_for_verticals: TrainingVertical[];
  sort_order: number;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isPlainString(v: unknown): v is string {
  return typeof v === "string";
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v)) {
    return v;
  }
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) {
    return parseInt(v, 10);
  }
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

/**
 * Validate a course payload for create. Returns ok=true with a normalised
 * shape or ok=false with the first error message.
 */
export function validateCourseCreate(
  input: CourseInput,
): ValidationResult<ValidatedCourse> {
  if (!isPlainString(input.slug) || !SLUG_RE.test(input.slug)) {
    return {
      ok: false,
      error:
        "slug must be 1-80 chars, lowercase letters/digits/_/- and start alphanumeric",
    };
  }
  if (!isPlainString(input.title) || input.title.trim().length === 0) {
    return { ok: false, error: "title is required" };
  }
  if (!isPlainString(input.summary) || input.summary.trim().length === 0) {
    return { ok: false, error: "summary is required" };
  }
  if (
    !isPlainString(input.category) ||
    !(TRAINING_CATEGORIES as readonly string[]).includes(input.category)
  ) {
    return {
      ok: false,
      error: `category must be one of ${TRAINING_CATEGORIES.join(", ")}`,
    };
  }
  const ceu = asNumber(input.ceu_credits);
  if (ceu === null || ceu <= 0) {
    return { ok: false, error: "ceu_credits must be > 0" };
  }
  const duration = asInt(input.duration_minutes);
  if (duration === null || duration <= 0) {
    return { ok: false, error: "duration_minutes must be > 0" };
  }
  if (
    !isPlainString(input.country_scope) ||
    !(TRAINING_COUNTRY_SCOPES as readonly string[]).includes(input.country_scope)
  ) {
    return {
      ok: false,
      error: `country_scope must be one of ${TRAINING_COUNTRY_SCOPES.join(", ")}`,
    };
  }
  // Video provider has a DB default of 'embed' — accept missing and default it.
  let videoProvider: TrainingVideoProvider = "embed";
  if (input.video_provider !== undefined && input.video_provider !== null) {
    if (
      !isPlainString(input.video_provider) ||
      !(TRAINING_VIDEO_PROVIDERS as readonly string[]).includes(
        input.video_provider,
      )
    ) {
      return {
        ok: false,
        error: `video_provider must be one of ${TRAINING_VIDEO_PROVIDERS.join(", ")}`,
      };
    }
    videoProvider = input.video_provider as TrainingVideoProvider;
  }
  if (
    input.video_url !== undefined &&
    input.video_url !== null &&
    !isPlainString(input.video_url)
  ) {
    return { ok: false, error: "video_url must be a string" };
  }
  if (
    input.transcript_md !== undefined &&
    input.transcript_md !== null &&
    !isPlainString(input.transcript_md)
  ) {
    return { ok: false, error: "transcript_md must be a string" };
  }
  if (!Array.isArray(input.required_for_verticals)) {
    return {
      ok: false,
      error: "required_for_verticals must be an array",
    };
  }
  const verts: TrainingVertical[] = [];
  for (const v of input.required_for_verticals) {
    if (
      !isPlainString(v) ||
      !(TRAINING_VERTICALS as readonly string[]).includes(v)
    ) {
      return {
        ok: false,
        error: `required_for_verticals entries must be one of ${TRAINING_VERTICALS.join(", ")}`,
      };
    }
    if (!verts.includes(v as TrainingVertical)) {
      verts.push(v as TrainingVertical);
    }
  }
  const sortOrder = asInt(input.sort_order ?? 0);
  if (sortOrder === null) {
    return { ok: false, error: "sort_order must be an integer" };
  }

  return {
    ok: true,
    value: {
      slug: input.slug,
      title: input.title.trim(),
      summary: input.summary.trim(),
      category: input.category as TrainingCategory,
      is_required: Boolean(input.is_required),
      ceu_credits: ceu,
      video_url: isPlainString(input.video_url) ? input.video_url : null,
      video_provider: videoProvider,
      transcript_md: isPlainString(input.transcript_md)
        ? input.transcript_md
        : null,
      duration_minutes: duration,
      country_scope: input.country_scope as TrainingCountryScope,
      required_for_verticals: verts,
      sort_order: sortOrder,
    },
  };
}

/**
 * Partial validator for PATCH — fields are optional and only validated when
 * present. Returns the normalised subset.
 */
export function validateCoursePatch(
  input: CourseInput,
): ValidationResult<Partial<ValidatedCourse>> {
  const out: Partial<ValidatedCourse> = {};
  if (input.slug !== undefined) {
    if (!isPlainString(input.slug) || !SLUG_RE.test(input.slug)) {
      return { ok: false, error: "slug must be 1-80 chars, [a-z0-9_-]" };
    }
    out.slug = input.slug;
  }
  if (input.title !== undefined) {
    if (!isPlainString(input.title) || input.title.trim().length === 0) {
      return { ok: false, error: "title must be a non-empty string" };
    }
    out.title = input.title.trim();
  }
  if (input.summary !== undefined) {
    if (!isPlainString(input.summary) || input.summary.trim().length === 0) {
      return { ok: false, error: "summary must be a non-empty string" };
    }
    out.summary = input.summary.trim();
  }
  if (input.category !== undefined) {
    if (
      !isPlainString(input.category) ||
      !(TRAINING_CATEGORIES as readonly string[]).includes(input.category)
    ) {
      return {
        ok: false,
        error: `category must be one of ${TRAINING_CATEGORIES.join(", ")}`,
      };
    }
    out.category = input.category as TrainingCategory;
  }
  if (input.is_required !== undefined) {
    out.is_required = Boolean(input.is_required);
  }
  if (input.ceu_credits !== undefined) {
    const n = asNumber(input.ceu_credits);
    if (n === null || n <= 0) {
      return { ok: false, error: "ceu_credits must be > 0" };
    }
    out.ceu_credits = n;
  }
  if (input.video_url !== undefined) {
    if (input.video_url !== null && !isPlainString(input.video_url)) {
      return { ok: false, error: "video_url must be a string or null" };
    }
    out.video_url = (input.video_url as string | null) ?? null;
  }
  if (input.video_provider !== undefined) {
    if (
      !isPlainString(input.video_provider) ||
      !(TRAINING_VIDEO_PROVIDERS as readonly string[]).includes(
        input.video_provider,
      )
    ) {
      return {
        ok: false,
        error: `video_provider must be one of ${TRAINING_VIDEO_PROVIDERS.join(", ")}`,
      };
    }
    out.video_provider = input.video_provider as TrainingVideoProvider;
  }
  if (input.transcript_md !== undefined) {
    if (input.transcript_md !== null && !isPlainString(input.transcript_md)) {
      return { ok: false, error: "transcript_md must be a string or null" };
    }
    out.transcript_md = (input.transcript_md as string | null) ?? null;
  }
  if (input.duration_minutes !== undefined) {
    const d = asInt(input.duration_minutes);
    if (d === null || d <= 0) {
      return { ok: false, error: "duration_minutes must be > 0" };
    }
    out.duration_minutes = d;
  }
  if (input.country_scope !== undefined) {
    if (
      !isPlainString(input.country_scope) ||
      !(TRAINING_COUNTRY_SCOPES as readonly string[]).includes(
        input.country_scope,
      )
    ) {
      return {
        ok: false,
        error: `country_scope must be one of ${TRAINING_COUNTRY_SCOPES.join(", ")}`,
      };
    }
    out.country_scope = input.country_scope as TrainingCountryScope;
  }
  if (input.required_for_verticals !== undefined) {
    if (!Array.isArray(input.required_for_verticals)) {
      return { ok: false, error: "required_for_verticals must be an array" };
    }
    const verts: TrainingVertical[] = [];
    for (const v of input.required_for_verticals) {
      if (
        !isPlainString(v) ||
        !(TRAINING_VERTICALS as readonly string[]).includes(v)
      ) {
        return {
          ok: false,
          error: `required_for_verticals entries must be one of ${TRAINING_VERTICALS.join(", ")}`,
        };
      }
      if (!verts.includes(v as TrainingVertical)) {
        verts.push(v as TrainingVertical);
      }
    }
    out.required_for_verticals = verts;
  }
  if (input.sort_order !== undefined) {
    const s = asInt(input.sort_order);
    if (s === null) {
      return { ok: false, error: "sort_order must be an integer" };
    }
    out.sort_order = s;
  }
  return { ok: true, value: out };
}

export type QuestionInput = {
  prompt?: unknown;
  options?: unknown;
  correct_index?: unknown;
  explanation?: unknown;
  sort_order?: unknown;
};

export type ValidatedQuestion = {
  prompt: string;
  options: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation: string | null;
  sort_order: number;
};

/**
 * Validate an array of question payloads for the bulk PUT.
 * Rule: exactly 4 options per question, correct_index in 0..3.
 */
export function validateQuestionSet(
  raw: unknown,
): ValidationResult<ValidatedQuestion[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "questions must be an array" };
  }
  const out: ValidatedQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as QuestionInput;
    if (!q || typeof q !== "object") {
      return { ok: false, error: `question[${i}] must be an object` };
    }
    if (!isPlainString(q.prompt) || q.prompt.trim().length === 0) {
      return {
        ok: false,
        error: `question[${i}].prompt is required`,
      };
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return {
        ok: false,
        error: `question[${i}].options must be an array of exactly 4 strings`,
      };
    }
    const opts: string[] = [];
    for (let j = 0; j < 4; j++) {
      const o = q.options[j];
      if (!isPlainString(o) || o.trim().length === 0) {
        return {
          ok: false,
          error: `question[${i}].options[${j}] must be a non-empty string`,
        };
      }
      opts.push(o);
    }
    const ci = asInt(q.correct_index);
    if (ci === null || ci < 0 || ci > 3) {
      return {
        ok: false,
        error: `question[${i}].correct_index must be 0, 1, 2, or 3`,
      };
    }
    if (
      q.explanation !== undefined &&
      q.explanation !== null &&
      !isPlainString(q.explanation)
    ) {
      return {
        ok: false,
        error: `question[${i}].explanation must be a string or null`,
      };
    }
    const so = asInt(q.sort_order ?? i + 1);
    if (so === null) {
      return {
        ok: false,
        error: `question[${i}].sort_order must be an integer`,
      };
    }
    out.push({
      prompt: q.prompt.trim(),
      options: [opts[0], opts[1], opts[2], opts[3]] as [
        string,
        string,
        string,
        string,
      ],
      correct_index: ci as 0 | 1 | 2 | 3,
      explanation: isPlainString(q.explanation) ? q.explanation : null,
      sort_order: so,
    });
  }
  return { ok: true, value: out };
}
