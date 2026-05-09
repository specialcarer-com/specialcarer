/**
 * Shared types and constants for the carer vetting flows.
 * Touched by API routes, dashboard pages, and admin trust-safety.
 */

export type Vertical =
  | "elderly_care"
  | "childcare"
  | "special_needs"
  | "postnatal"
  | "complex_care";

export const VERTICALS: readonly Vertical[] = [
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
];

export const VERTICAL_LABEL: Record<Vertical, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special-needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
};

export const MAX_REFERENCES = 3;
export const MAX_CERTIFICATIONS = 20;
export const SKILLS_PASS_THRESHOLD = 70;
export const SKILLS_COOLDOWN_HOURS = 24;
export const INTERVIEW_PROMPT_COUNT = 3;
export const INTERVIEW_MAX_SECONDS = 60;

export const CERTIFICATIONS_BUCKET = "certifications";
export const INTERVIEW_VIDEOS_BUCKET = "interview-videos";

export type CertTypeOption = { key: string; label: string };

/**
 * Predefined cert types. `Other` is the catch-all — when chosen the
 * carer is asked to fill in a freeform issuer label so admins still
 * have something to verify against.
 */
export const CERT_TYPES: readonly CertTypeOption[] = [
  { key: "cpr", label: "CPR" },
  { key: "first_aid", label: "First Aid" },
  { key: "pediatric_first_aid", label: "Paediatric First Aid" },
  { key: "cna", label: "CNA (US)" },
  { key: "hca", label: "Health Care Assistant (UK)" },
  { key: "rn", label: "Registered Nurse" },
  { key: "rgn", label: "RGN — Registered General Nurse" },
  { key: "nmc_pin", label: "NMC PIN (UK)" },
  { key: "dbs", label: "DBS Certificate" },
  { key: "sen", label: "SEN — Special Educational Needs" },
  { key: "manual_handling", label: "Manual Handling" },
  { key: "food_hygiene", label: "Food Hygiene" },
  { key: "safeguarding_adults", label: "Safeguarding Adults" },
  { key: "safeguarding_children", label: "Safeguarding Children" },
  { key: "dementia", label: "Dementia Care" },
  { key: "mhfa", label: "Mental Health First Aid" },
  { key: "live_in_care", label: "Live-In Care" },
  { key: "driving_license", label: "Driving Licence" },
  { key: "other", label: "Other" },
];

export const CERT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CERT_TYPES.map((c) => [c.key, c.label]),
);

export const INTERVIEW_PROMPTS: readonly string[] = [
  "Tell us about yourself and why you want to care for others on SpecialCarer.",
  "Describe a difficult care situation you've handled and what you learned.",
  "How do you maintain confidentiality and dignity for people in your care?",
];

export type CourseModuleKey =
  | "safeguarding_adults"
  | "safeguarding_children"
  | "platform_policies"
  | "code_of_conduct"
  | "lone_working"
  | "gdpr_confidentiality";

export const COURSE_MODULE_KEYS: readonly CourseModuleKey[] = [
  "safeguarding_adults",
  "safeguarding_children",
  "platform_policies",
  "code_of_conduct",
  "lone_working",
  "gdpr_confidentiality",
];

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
};

export type QuizQuestionPublic = Omit<QuizQuestion, "correctIndex">;

export type CourseModule = {
  key: CourseModuleKey;
  title: string;
  summary: string;
  bodyMarkdown: string;
  question: string;
  options: string[];
  correctIndex: number;
};

export type ReferenceStatus =
  | "invited"
  | "submitted"
  | "verified"
  | "rejected"
  | "expired";

export type CertStatus = "pending" | "verified" | "rejected" | "expired";

export type InterviewStatus = "pending" | "approved" | "rejected";

export type VettingSummary = {
  references: { verified: number; total: number; complete: boolean };
  certifications: { verified: number; pending: number };
  skills: {
    verticals_passed: Vertical[];
    has_any_pass: boolean;
  };
  interview: { approved: number; required: number; complete: boolean };
  course: { completed_modules: number; total: number; complete: boolean };
  background_checks_complete: boolean;
  is_fully_vetted: boolean;
};
