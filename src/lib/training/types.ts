/**
 * Shared types for the Training Hub (3.9). Continuing-education
 * courses with video, longer quizzes, CEU credits and certificates.
 * Separate from the vetting onboarding course and skills quiz.
 */

export const TRAINING_PASS_THRESHOLD = 80; // 4 of 5 = 80%
export const TRAINING_RETRY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export type TrainingCategory =
  | "clinical"
  | "behavioural"
  | "operational"
  | "compliance";

export type TrainingCountryScope = "UK" | "US" | "both";

export type TrainingVideoProvider = "embed" | "mp4" | "youtube";

export type TrainingCourse = {
  id: string;
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
  required_for_verticals: string[];
  sort_order: number;
};

export type TrainingEnrollment = {
  id: string;
  carer_id: string;
  course_id: string;
  started_at: string;
  video_completed_at: string | null;
  quiz_passed_at: string | null;
  quiz_best_score: number | null;
  attempts: number;
  certificate_url: string | null;
  ceu_credits_awarded: number;
  verification_code: string | null;
};

export type TrainingQuizQuestion = {
  id: string;
  course_id: string;
  sort_order: number;
  prompt: string;
  options: string[];
  // correct_index + explanation are NOT exposed via the public-quiz endpoint
};

export type TrainingQuizQuestionFull = TrainingQuizQuestion & {
  correct_index: number;
  explanation: string | null;
};

export type CourseWithEnrollment = TrainingCourse & {
  enrollment: TrainingEnrollment | null;
};

export const CATEGORY_LABEL: Record<TrainingCategory, string> = {
  clinical: "Clinical",
  behavioural: "Behavioural",
  operational: "Operational",
  compliance: "Compliance",
};

/**
 * Generate an 8-character uppercase verification code from a UUID.
 * Collision risk is acceptable at this size (16^8 = 4.3B) for human-
 * readability; the column is unique so a duplicate insert simply
 * fails and the API retries.
 */
export function generateVerificationCode(): string {
  const uuid = (globalThis.crypto as Crypto).randomUUID();
  return uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
}
