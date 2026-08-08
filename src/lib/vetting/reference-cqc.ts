import { REFERENCE_TYPES, type ReferenceType } from "./types";

export type ReferenceGateRow = {
  status: string;
  reference_type: ReferenceType | string | null;
};

export type ReferenceGateStatus = {
  verified: number;
  total: number;
  verified_employer: number;
  complete: boolean;
};

export function isReferenceType(value: unknown): value is ReferenceType {
  return (
    typeof value === "string" &&
    (REFERENCE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * A null type represents a reference created before Schedule 3 structured
 * fields. Treat it as employer to preserve the completion status of existing
 * carers while the new form makes the type explicit for every new reference.
 */
export function calculateReferenceGate(
  rows: ReferenceGateRow[],
): ReferenceGateStatus {
  const verifiedRows = rows.filter((row) => row.status === "verified");
  const verified = verifiedRows.length;
  const verified_employer = verifiedRows.filter(
    (row) =>
      row.reference_type === null || row.reference_type === "employer",
  ).length;
  return {
    verified,
    total: rows.length,
    verified_employer,
    complete: verified >= 2 && verified_employer >= 1,
  };
}

export function validateEmploymentDates(args: {
  employmentStart: string | null;
  employmentEnd: string | null;
  stillEmployed: boolean;
  today: string;
}): string | null {
  if (args.employmentStart && args.employmentStart > args.today) {
    return "Employment start date cannot be in the future";
  }
  if (
    args.employmentStart &&
    args.employmentEnd &&
    args.employmentEnd < args.employmentStart
  ) {
    return "Employment end date cannot be before the start date";
  }
  if (args.stillEmployed && args.employmentEnd) {
    return "Employment end date must be empty when still employed";
  }
  return null;
}

export function validateReferenceVerifyGuard(args: {
  safeguardingDbs: string | null;
  adminNotes: string;
}): string | null {
  if (!args.safeguardingDbs) return "safeguarding_dbs_required";
  if (args.safeguardingDbs === "yes" && !args.adminNotes.trim()) {
    return "admin_notes_required_for_safeguarding_yes";
  }
  return null;
}
