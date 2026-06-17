/**
 * DBS ↔ Veriff cross-check (PR-DBS-2).
 *
 * After a carer completes Veriff identity verification (PR #107, behind
 * IDENTITY_VERIFICATION_ENABLED) we hold their gov-ID-confirmed first name,
 * surname, and date of birth in identity_verifications.decision_json. Before a
 * DBS application is submitted we cross-check the name + DOB the carer entered
 * for the DBS against that confirmed identity, so a carer can't apply for a DBS
 * under a name that doesn't match their verified ID.
 *
 * Comparison rules:
 *   - surname: exact match, case-insensitive, trimmed.
 *   - DOB:     exact match (YYYY-MM-DD).
 * A mismatch blocks submission unless an admin has recorded a surname override
 * (hyphenation / maiden-name cases) via the admin UI.
 *
 * The pure comparison (compareIdentities) is exported for unit testing without
 * a database. The DB-backed crossCheckDbsAgainstVeriff() persists the result on
 * the carer's dbs_applications rows and is gated by NEXT_PUBLIC_DBS_ENABLED.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { US_REGION_ENABLED } from "@/lib/region";
import { isDbsEnabled } from "./flag";
import { DbsDisabledError } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

let adminClientFactory: () => AdminClient = createAdminClient;

/** Test seam: override the admin client used by the cross-check layer. */
export function setCrossCheckAdminClientFactory(
  factory: (() => AdminClient) | null,
): void {
  adminClientFactory = factory ?? createAdminClient;
}

function client(): AdminClient {
  return adminClientFactory();
}

/**
 * UK-only regional constraint until the US launch (see @/lib/region). PostgREST
 * can't filter an UPDATE by an embedded resource, so writes to dbs_applications
 * (which join to caregiver_profiles for country) must be guarded by an explicit
 * GB-carer check first. Returns true when the carer may be written to.
 */
async function carerIsGb(carerId: string): Promise<boolean> {
  if (US_REGION_ENABLED) return true;
  const admin = client();
  const { data } = await admin
    .from("caregiver_profiles")
    .select("user_id")
    .eq("user_id", carerId)
    .eq("country", "GB")
    .maybeSingle();
  return Boolean(data);
}

export type IdentityFacts = {
  surname?: string | null;
  dateOfBirth?: string | null; // YYYY-MM-DD
};

export type CrossCheckResult = {
  ok: boolean;
  mismatches: string[];
  overridden: boolean;
};

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Pure comparison of DBS-entered identity vs Veriff-confirmed identity.
 * `overridden` short-circuits a surname mismatch to ok (the admin has signed
 * off a hyphenation / maiden-name case); a DOB mismatch is never overridable.
 */
export function compareIdentities(
  dbs: IdentityFacts,
  veriff: IdentityFacts,
  overridden = false,
): CrossCheckResult {
  const mismatches: string[] = [];

  if (norm(dbs.surname) !== norm(veriff.surname)) mismatches.push("surname");
  if (norm(dbs.dateOfBirth) !== norm(veriff.dateOfBirth)) {
    mismatches.push("dob");
  }

  // A surname-only mismatch can be overridden by an admin. A DOB mismatch (or
  // both) always fails.
  const onlySurname = mismatches.length === 1 && mismatches[0] === "surname";
  const ok = mismatches.length === 0 || (overridden && onlySurname);

  return { ok, mismatches, overridden };
}

/** Pull the Veriff-confirmed person facts out of a decision_json payload. */
export function veriffFactsFromDecision(decision: unknown): IdentityFacts {
  if (!decision || typeof decision !== "object") return {};
  const d = decision as {
    verification?: {
      person?: {
        lastName?: unknown;
        dateOfBirth?: unknown;
      };
    };
  };
  const person = d.verification?.person;
  return {
    surname: typeof person?.lastName === "string" ? person.lastName : null,
    dateOfBirth:
      typeof person?.dateOfBirth === "string" ? person.dateOfBirth : null,
  };
}

/**
 * Run the cross-check for a carer: load their latest approved Veriff decision
 * and their DBS application identity, compare, and persist the result on every
 * one of the carer's dbs_applications rows. Returns the comparison result.
 *
 * When the carer has no completed Veriff verification, the cross-check is a
 * no-op pass (ok=true, no mismatches) — identity verification is a separate,
 * independently-gated feature, so DBS submission is not blocked on it.
 */
export async function crossCheckDbsAgainstVeriff(
  carerId: string,
  dbsFacts: IdentityFacts,
): Promise<CrossCheckResult> {
  if (!isDbsEnabled()) throw new DbsDisabledError();
  const admin = client();

  // Latest approved Veriff verification for this carer.
  const { data: iv } = await admin
    .from("identity_verifications")
    .select("decision_json, status, updated_at")
    .eq("user_id", carerId)
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!iv) {
    // No verified identity to compare against — pass, but record the run.
    const result: CrossCheckResult = {
      ok: true,
      mismatches: [],
      overridden: false,
    };
    await persist(carerId, result);
    return result;
  }

  // Is there an admin surname override on any of this carer's applications?
  // UK-only regional constraint (see @/lib/region) — restrict to GB carers via
  // an inner join on caregiver_profiles.country.
  let overrideQuery = admin
    .from("dbs_applications")
    .select("surname_override_by, caregiver_profiles!inner(country)")
    .eq("carer_id", carerId)
    .not("surname_override_by", "is", null)
    .limit(1);
  if (!US_REGION_ENABLED) {
    overrideQuery = overrideQuery.eq("caregiver_profiles.country", "GB");
  }
  const { data: overrideRows } = await overrideQuery;
  const overridden = (overrideRows ?? []).length > 0;

  const veriff = veriffFactsFromDecision(
    (iv as { decision_json: unknown }).decision_json,
  );
  const result = compareIdentities(dbsFacts, veriff, overridden);
  await persist(carerId, result);
  return result;
}

async function persist(
  carerId: string,
  result: CrossCheckResult,
): Promise<void> {
  if (!(await carerIsGb(carerId))) return;
  const admin = client();
  await admin
    .from("dbs_applications")
    .update({
      cross_check_passed: result.ok,
      cross_check_run_at: new Date().toISOString(),
      cross_check_mismatches: result.mismatches,
    })
    .eq("carer_id", carerId);
}

/**
 * Record an admin surname-mismatch override on all of a carer's DBS
 * applications. Used by the admin decision route when the "surname override"
 * toggle is set (hyphenation / maiden-name cases).
 */
export async function recordSurnameOverride(
  carerId: string,
  adminUserId: string,
  reason: string,
): Promise<void> {
  if (!isDbsEnabled()) throw new DbsDisabledError();
  if (!(await carerIsGb(carerId))) return;
  const admin = client();
  await admin
    .from("dbs_applications")
    .update({
      surname_override_by: adminUserId,
      surname_override_at: new Date().toISOString(),
      surname_override_reason: reason,
    })
    .eq("carer_id", carerId);
}
