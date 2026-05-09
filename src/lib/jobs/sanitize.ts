/**
 * Server-side sanitisers for carer-facing pre-acceptance data.
 *
 * Pre-acceptance the carer sees a redacted snapshot. Names, full DOB,
 * full addresses, medications, school info NEVER leave the server in
 * the pre-acceptance surface — these helpers exist so that constraint
 * is one obvious read away from any caller.
 */

import "server-only";

const MAX_LIST_TAGS = 2;

export type RecipientKind = "child" | "senior" | "home";

export type RawRecipient = {
  id: string;
  kind: RecipientKind;
  display_name: string | null;
  date_of_birth: string | null;
  allergies: string[] | null;
  medical_conditions: string[] | null;
  mobility_level: string | null;
  special_needs: string[] | null;
  property_size: string | null;
  has_pets: boolean | null;
};

export type SanitizedRecipient = {
  id: string;
  kind: RecipientKind;
  /** Headline label, e.g. "5yo child" / "Senior, assisted" / "Home, 2bed". */
  label: string;
  /** Optional sub-tags safe to surface pre-acceptance, e.g. allergies. */
  tags: string[];
};

const MOBILITY_LABEL: Record<string, string> = {
  independent: "independent",
  assisted: "assisted",
  wheelchair: "wheelchair",
  bedbound: "bedbound",
};

const PROPERTY_SIZE_LABEL: Record<string, string> = {
  studio: "studio",
  "1bed": "1-bed",
  "2bed": "2-bed",
  "3bed": "3-bed",
  "4bed_plus": "4+ bed",
  house_small: "small house",
  house_med: "medium house",
  house_large: "large house",
};

function ageFromDOB(dob: string | null): number | null {
  if (!dob) return null;
  const ts = Date.parse(dob);
  if (Number.isNaN(ts)) return null;
  const ms = Date.now() - ts;
  if (ms < 0) return null;
  const years = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  if (years < 0 || years > 130) return null;
  return years;
}

/**
 * Reduce a household_recipients row to the redacted shape the carer
 * sees pre-acceptance. NEVER returns name / DOB / address / school /
 * medications / pets_notes raw text.
 */
export function sanitizeRecipient(r: RawRecipient): SanitizedRecipient {
  if (r.kind === "child") {
    const age = ageFromDOB(r.date_of_birth);
    const head = age != null ? `${age}yo child` : "Child";
    const tags: string[] = [];
    const allergies = (r.allergies ?? []).slice(0, MAX_LIST_TAGS);
    if (allergies.length > 0) {
      tags.push(`Allergies: ${allergies.join(", ")}`);
    }
    const sn = (r.special_needs ?? []).slice(0, MAX_LIST_TAGS);
    if (sn.length > 0) {
      tags.push(`Needs: ${sn.join(", ")}`);
    }
    return { id: r.id, kind: "child", label: head, tags };
  }
  if (r.kind === "senior") {
    const mobility =
      r.mobility_level && MOBILITY_LABEL[r.mobility_level]
        ? MOBILITY_LABEL[r.mobility_level]
        : null;
    const head = mobility ? `Senior · ${mobility}` : "Senior";
    const tags: string[] = [];
    const cond = (r.medical_conditions ?? []).slice(0, MAX_LIST_TAGS);
    if (cond.length > 0) {
      tags.push(`Conditions: ${cond.join(", ")}`);
    }
    return { id: r.id, kind: "senior", label: head, tags };
  }
  // home
  const size =
    r.property_size && PROPERTY_SIZE_LABEL[r.property_size]
      ? PROPERTY_SIZE_LABEL[r.property_size]
      : null;
  const head = size ? `Home · ${size}` : "Home";
  const tags: string[] = [];
  if (r.has_pets) tags.push("+ pets");
  return { id: r.id, kind: "home", label: head, tags };
}

/** UK outward / US ZIP-3 prefix for the pre-acceptance address. */
export function partialPostcode(pc: string | null | undefined): string | null {
  if (!pc) return null;
  const t = pc.trim().toUpperCase();
  if (t.includes(" ")) return t.split(" ")[0];
  if (/^\d{5}/.test(t)) return t.slice(0, 3);
  return t.slice(0, 3);
}

/** First word of full_name, defaults to "Client" when blank. */
export function firstName(full: string | null | undefined): string {
  if (!full) return "Client";
  const t = full.trim();
  if (!t) return "Client";
  return t.split(/\s+/)[0];
}
