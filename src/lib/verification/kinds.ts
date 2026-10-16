/**
 * Manual verification evidence: what a carer submits and what the back office
 * checks, per check kind. Config-driven so items can be added or reworded
 * without touching the UI or the API.
 */

export type FieldType = "text" | "textarea" | "date" | "checkbox" | "select" | "file";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  /** file fields only: images only, or images + PDF. */
  accept?: "image" | "image_or_pdf";
  minLength?: number;
};

export type KindDef = {
  kind: KindKey;
  label: string;
  blurb: string;
  /** background_checks.check_type this kind clears on approval (gates publishing). */
  bgCheckType?: "enhanced_dbs_barred" | "right_to_work" | "digital_id";
  fields: FieldDef[];
  checklist: { key: string; label: string }[];
  /** Reviewer may record an expiry date (e.g. time-limited right to work). */
  allowsExpiry?: boolean;
  /** Delete uploaded files once a decision is recorded (data minimisation). */
  deleteFilesOnDecision?: boolean;
};

export const KIND_KEYS = [
  "right_to_work",
  "identity",
  "dbs",
  "employment_history",
  "references",
  "health_declaration",
  "qualifications",
] as const;
export type KindKey = (typeof KIND_KEYS)[number];

export const KINDS: Record<KindKey, KindDef> = {
  right_to_work: {
    kind: "right_to_work",
    label: "Right to work",
    blurb:
      "Share code from the gov.uk 'prove your right to work' service. British and Irish citizens cannot use a share code: contact support to arrange a check.",
    bgCheckType: "right_to_work",
    allowsExpiry: true,
    fields: [
      { key: "share_code", label: "Share code", type: "text", required: true, help: "9 characters, e.g. W12 345 678" },
      { key: "date_of_birth", label: "Date of birth", type: "date", required: true },
    ],
    checklist: [
      { key: "share_code_valid_on_govuk", label: "Share code checked on gov.uk and valid today" },
      { key: "name_dob_match_profile", label: "Name and date of birth match the carer's profile" },
      { key: "permission_covers_this_work", label: "Permission to work covers this type of work (no restriction or work-hours limit that rules it out)" },
      { key: "photo_matches_carer", label: "Photo on the gov.uk result matches the carer" },
    ],
  },
  identity: {
    kind: "identity",
    label: "Photo ID",
    blurb: "A clear photo of a current passport, driving licence or BRP. We delete the photo once we have checked it.",
    bgCheckType: "digital_id",
    deleteFilesOnDecision: true,
    fields: [
      {
        key: "id_type",
        label: "Document type",
        type: "select",
        required: true,
        options: [
          { value: "passport", label: "Passport" },
          { value: "driving_licence", label: "Driving licence" },
          { value: "brp", label: "Biometric residence permit" },
        ],
      },
      { key: "id_photo", label: "Photo of the document", type: "file", required: true, accept: "image" },
    ],
    checklist: [
      { key: "photo_matches_profile", label: "Photo on the document matches the carer's profile photo" },
      { key: "document_valid_in_date", label: "Document is genuine-looking and in date" },
      { key: "name_matches_profile", label: "Name matches the carer's profile" },
    ],
  },
  dbs: {
    kind: "dbs",
    label: "DBS certificate",
    blurb:
      "Enhanced DBS with barred list check, and you must be subscribed to the DBS Update Service so we can check it online.",
    bgCheckType: "enhanced_dbs_barred",
    fields: [
      { key: "certificate_number", label: "Certificate number", type: "text", required: true, help: "12 digits" },
      { key: "date_of_birth", label: "Date of birth", type: "date", required: true },
      { key: "certificate_photo", label: "Photo of the certificate", type: "file", required: true, accept: "image_or_pdf" },
      {
        key: "consent_update_service",
        label: "I am subscribed to the DBS Update Service and I consent to SpecialCarer checking my certificate status online",
        type: "checkbox",
        required: true,
      },
    ],
    checklist: [
      { key: "update_service_status_current", label: "Update Service shows the certificate is current with no new information" },
      { key: "enhanced_with_barred_list", label: "Certificate is Enhanced with the adults' barred list check" },
      { key: "name_dob_match_profile", label: "Name and date of birth match the carer's profile" },
      { key: "certificate_issued_to_carer", label: "Certificate was issued to this carer (not someone else's)" },
    ],
  },
  employment_history: {
    kind: "employment_history",
    label: "Employment history",
    blurb: "Your full work history, with any gaps explained.",
    fields: [
      { key: "history", label: "Work history (most recent first, with dates)", type: "textarea", required: true, minLength: 50 },
      { key: "gaps_explained", label: "Explanation of any gaps", type: "textarea", help: "Write 'none' if there are no gaps." , required: true },
      { key: "cv", label: "CV (optional)", type: "file", accept: "image_or_pdf" },
    ],
    checklist: [
      { key: "full_history_provided", label: "A full employment history is provided" },
      { key: "gaps_explained", label: "Any gaps are satisfactorily explained" },
    ],
  },
  references: {
    kind: "references",
    label: "References",
    blurb: "Two referees who can speak about your conduct, ideally your most recent employers in care.",
    fields: [
      { key: "ref1_name", label: "Referee 1: name", type: "text", required: true },
      { key: "ref1_relationship", label: "Referee 1: relationship to you", type: "text", required: true },
      { key: "ref1_email", label: "Referee 1: email", type: "text", required: true },
      { key: "ref2_name", label: "Referee 2: name", type: "text", required: true },
      { key: "ref2_relationship", label: "Referee 2: relationship to you", type: "text", required: true },
      { key: "ref2_email", label: "Referee 2: email", type: "text", required: true },
    ],
    checklist: [
      { key: "two_references_received", label: "Two written references received" },
      { key: "suitable_referees", label: "Referees are suitable (not family; most recent employer where applicable)" },
      { key: "satisfactory_conduct", label: "References give satisfactory evidence of conduct" },
    ],
  },
  health_declaration: {
    kind: "health_declaration",
    label: "Health declaration",
    blurb: "A short declaration that you are physically and mentally able to do the work, with or without adjustments.",
    fields: [
      {
        key: "fit_declaration",
        label: "I declare that I am physically and mentally able to carry out care work, with reasonable adjustments if needed",
        type: "checkbox",
        required: true,
      },
      { key: "adjustments", label: "Anything we should know or any adjustments you need (optional)", type: "textarea" },
    ],
    checklist: [
      { key: "declaration_reviewed", label: "Declaration reviewed" },
      { key: "no_unresolved_concerns", label: "No unresolved concerns, or adjustments are recorded" },
    ],
  },
  qualifications: {
    kind: "qualifications",
    label: "Qualifications and training",
    blurb: "Care qualifications or training certificates you hold (optional evidence).",
    fields: [
      { key: "details", label: "Qualifications and training", type: "textarea", required: true, minLength: 10 },
      { key: "certificate", label: "Certificate (optional)", type: "file", accept: "image_or_pdf" },
    ],
    checklist: [{ key: "qualifications_seen", label: "Qualifications and training reviewed" }],
  },
};

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type RawInput = Record<string, string | boolean | undefined>;

export function normaliseShareCode(v: string): string {
  return v.replace(/[\s-]/g, "").toUpperCase();
}

function validDob(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const now = new Date();
  const age = now.getUTCFullYear() - d.getUTCFullYear() - (now < new Date(Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) ? 1 : 0);
  return age >= 16 && age <= 100;
}

export type SubmissionResult =
  | { ok: true; data: Record<string, string | boolean>; consent: boolean }
  | { ok: false; errors: string[] };

/** Validate and normalise non-file fields. `filesPresent` lists file field keys uploaded. */
export function validateSubmission(
  kind: KindKey,
  input: RawInput,
  filesPresent: string[],
): SubmissionResult {
  const def = KINDS[kind];
  const errors: string[] = [];
  const data: Record<string, string | boolean> = {};

  for (const f of def.fields) {
    if (f.type === "file") {
      if (f.required && !filesPresent.includes(f.key)) errors.push(`${f.label} is required`);
      continue;
    }
    const raw = input[f.key];
    if (f.type === "checkbox") {
      const on = raw === true || raw === "true" || raw === "on";
      if (f.required && !on) errors.push(`Please tick: ${f.label}`);
      data[f.key] = on;
      continue;
    }
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) {
      if (f.required) errors.push(`${f.label} is required`);
      continue;
    }
    if (v.length > 4000) {
      errors.push(`${f.label} is too long`);
      continue;
    }
    if (f.minLength && v.length < f.minLength) {
      errors.push(`${f.label} needs a little more detail`);
      continue;
    }
    if (f.type === "select" && !f.options?.some((o) => o.value === v)) {
      errors.push(`${f.label} is not a valid choice`);
      continue;
    }
    if (f.type === "date" && f.key === "date_of_birth" && !validDob(v)) {
      errors.push("Date of birth is not valid");
      continue;
    }
    if (f.key === "share_code") {
      const c = normaliseShareCode(v);
      if (!/^[A-Z0-9]{9}$/.test(c)) {
        errors.push("Share code should be 9 letters and numbers");
        continue;
      }
      data[f.key] = c;
      continue;
    }
    if (f.key === "certificate_number") {
      const c = v.replace(/\s/g, "");
      if (!/^\d{12}$/.test(c)) {
        errors.push("DBS certificate number should be 12 digits");
        continue;
      }
      data[f.key] = c;
      continue;
    }
    if (f.key.endsWith("_email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      errors.push(`${f.label} is not a valid email`);
      continue;
    }
    data[f.key] = v;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, data, consent: kind === "dbs" && data.consent_update_service === true };
}

export type DecisionResult =
  | { ok: true; expiresAt: string | null }
  | { ok: false; error: string };

export function validateDecision(
  kind: KindKey,
  decision: "approved" | "rejected",
  checklist: Record<string, boolean>,
  note: string,
  expiresOn: string | null,
  now: Date = new Date(),
): DecisionResult {
  const def = KINDS[kind];
  const trimmed = (note ?? "").trim();
  if (decision === "rejected") {
    if (trimmed.length < 10) return { ok: false, error: "Please give the carer a reason (at least 10 characters)." };
    return { ok: true, expiresAt: null };
  }
  const missing = def.checklist.filter((c) => checklist[c.key] !== true);
  if (missing.length) return { ok: false, error: "Tick every item on the checklist before approving." };
  let expiresAt: string | null = null;
  if (expiresOn) {
    if (!def.allowsExpiry) return { ok: false, error: "This check does not take an expiry date." };
    const d = new Date(`${expiresOn}T23:59:59Z`);
    if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || d <= now) {
      return { ok: false, error: "Expiry date must be a valid future date." };
    }
    expiresAt = d.toISOString();
  }
  return { ok: true, expiresAt };
}

export function storagePath(userId: string, submissionId: string, key: string, mime: string): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "application/pdf" ? "pdf" : "jpg";
  return `${userId}/${submissionId}/${key}.${ext}`;
}

export function fileAllowed(accept: "image" | "image_or_pdf", mime: string): boolean {
  return IMAGE_TYPES.includes(mime) || (accept === "image_or_pdf" && mime === "application/pdf");
}
