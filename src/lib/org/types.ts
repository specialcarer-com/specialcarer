/**
 * Shared types + lookup tables for the organisation user type. Imported
 * by the registration flow, the org dashboard, and the admin queue.
 */

export type OrgCountry = "GB" | "US";

export type VerificationStatus =
  | "draft"
  | "pending"
  | "verified"
  | "rejected"
  | "suspended";

export type OrgPurpose =
  | "for_service_users"
  | "workforce_top_up"
  | "emergency_only"
  | "exploring";

export const ORG_PURPOSES: { key: OrgPurpose; label: string }[] = [
  {
    key: "for_service_users",
    label: "Booking carers for our service users / clients",
  },
  {
    key: "workforce_top_up",
    label: "Workforce top-up for our existing care service",
  },
  {
    key: "emergency_only",
    label: "Emergency / out-of-hours placement only",
  },
  { key: "exploring", label: "Just exploring (no booking intent yet)" },
];

export type OrgType = string; // free-form, validated against ORG_TYPES_*.

export const ORG_TYPES_GB = [
  { key: "nhs_trust", label: "NHS Trust / ICB" },
  { key: "local_authority", label: "Local Authority / Council" },
  { key: "social_services", label: "Social Services team" },
  { key: "discharge_team", label: "Hospital discharge team" },
  { key: "hospice", label: "Hospice" },
  { key: "residential_care_home", label: "Residential care home (single)" },
  { key: "care_home_group", label: "Care home group / multi-site provider" },
  { key: "domiciliary_care", label: "Domiciliary care provider" },
  { key: "fostering_agency", label: "Fostering agency" },
  { key: "childrens_residential", label: "Children's residential home" },
  { key: "sen_school", label: "SEN school / specialist school" },
  { key: "private_hospital", label: "Private hospital / clinic" },
  { key: "charity", label: "Charity / non-profit" },
  { key: "other", label: "Other" },
] as const;

export const ORG_TYPES_US = [
  { key: "hospital", label: "Hospital / health system" },
  { key: "hospice", label: "Hospice" },
  { key: "snf", label: "Skilled nursing facility" },
  { key: "alf", label: "Assisted living facility" },
  { key: "home_health", label: "Home health agency" },
  { key: "foster_care", label: "Foster care agency" },
  { key: "school_district", label: "School district / SEN school" },
  { key: "charity_501c3", label: "Charity / 501(c)(3)" },
  { key: "government", label: "Government / county social services" },
  { key: "other", label: "Other" },
] as const;

export const ORG_TYPE_KEYS = new Set<string>([
  ...ORG_TYPES_GB.map((t) => t.key),
  ...ORG_TYPES_US.map((t) => t.key),
]);

export const SIZE_BANDS = ["1-10", "11-50", "51-250", "250+"] as const;

export type SizeBand = (typeof SIZE_BANDS)[number];

export const JOB_TITLES = [
  "Registered manager",
  "Care coordinator",
  "Placement officer",
  "Social worker",
  "Discharge coordinator",
  "Workforce / HR manager",
  "Procurement officer",
  "Family services / family liaison",
  "Foster care advisor",
  "Director / CEO",
  "Other",
] as const;

export const DOC_KINDS = [
  "registration_certificate",
  "proof_of_address",
  "public_liability_insurance",
  "employers_liability_insurance",
  "signatory_letter",
  "safeguarding_policy",
  "other",
] as const;

export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  registration_certificate: "Registration certificate",
  proof_of_address: "Proof of address",
  public_liability_insurance: "Public liability insurance",
  employers_liability_insurance: "Employer's liability insurance",
  signatory_letter: "Authorised signatory letter",
  safeguarding_policy: "Safeguarding policy",
  other: "Other supporting document",
};

/**
 * Free-webmail blocklist used in registration step 5. Hitting one
 * doesn't hard-block; we surface a warning and require an explicit
 * "Continue anyway" tick that flips `free_email_override` on the
 * organisation row so admins can prioritise stricter manual review.
 */
export const FREE_EMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "outlook.co.uk",
  "live.com",
  "live.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "tutanota.com",
  "gmx.com",
  "gmx.co.uk",
]);

export function isFreeEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return FREE_EMAIL_DOMAINS.has(domain);
}

export type OfficeAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  postcode?: string;
  country?: OrgCountry;
};

export type OrgRow = {
  id: string;
  country: OrgCountry | null;
  org_type: string | null;
  purpose: string | null;
  legal_name: string | null;
  trading_name: string | null;
  companies_house_number: string | null;
  ein: string | null;
  vat_number: string | null;
  year_established: number | null;
  size_band: SizeBand | null;
  office_address: OfficeAddress | null;
  website: string | null;
  cqc_number: string | null;
  ofsted_urn: string | null;
  charity_number: string | null;
  la_gss_code: string | null;
  us_npi: string | null;
  other_registration_note: string | null;
  free_email_override: boolean;
  verification_status: VerificationStatus;
  verified_at: string | null;
  rejection_reason: string | null;
  booking_enabled: boolean;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};
