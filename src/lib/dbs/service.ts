/**
 * DBS application service layer (PR-DBS-1).
 *
 * Server-only. Orchestrates the dbs_applications lifecycle on top of the
 * vendor adapter (src/lib/dbs/vendor.ts) and the Supabase service-role
 * client. Every write path is gated by NEXT_PUBLIC_DBS_ENABLED and throws
 * DbsDisabledError when the flag is off.
 *
 * The pure recompute helper (computeOverall) is exported separately so it can
 * be unit-tested without a database.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getDbsVendor } from "./vendor";
import { isDbsEnabled } from "./flag";
import { crossCheckDbsAgainstVeriff } from "./cross-check";
import {
  DBS_COST_PENCE,
  DbsDisabledError,
  type DbsCarerDetails,
  type DbsKind,
  type DbsOverallStatus,
  type DbsStatus,
} from "./types";

/** Thrown by submitDbsApplication when the Veriff cross-check fails. */
export class DbsCrossCheckError extends Error {
  readonly mismatches: string[];
  constructor(mismatches: string[]) {
    super("Names don't match — admin will review");
    this.name = "DbsCrossCheckError";
    this.mismatches = mismatches;
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

// Overridable admin-client factory. Production uses createAdminClient(); tests
// inject an in-memory fake via setDbsAdminClientFactory() so the round-trip
// flows can run without a live database.
let adminClientFactory: () => AdminClient = createAdminClient;

/** Test seam: override the admin client used by the service layer. */
export function setDbsAdminClientFactory(
  factory: (() => AdminClient) | null,
): void {
  adminClientFactory = factory ?? createAdminClient;
}

function client(): AdminClient {
  return adminClientFactory();
}

/**
 * Create BOTH adult + child application rows in 'not_started' (idempotent —
 * skips a kind if a row already exists) and mark the carer's overall status
 * 'in_progress'.
 */
export async function initiateDbsApplications(carerId: string): Promise<void> {
  if (!isDbsEnabled()) throw new DbsDisabledError();
  const admin = client();

  const { data: existing } = await admin
    .from("dbs_applications")
    .select("kind")
    .eq("carer_id", carerId);
  const have = new Set((existing ?? []).map((r) => r.kind as DbsKind));

  const toCreate: DbsKind[] = (["adult", "child"] as DbsKind[]).filter(
    (k) => !have.has(k),
  );
  if (toCreate.length > 0) {
    await admin.from("dbs_applications").insert(
      toCreate.map((kind) => ({
        carer_id: carerId,
        kind,
        status: "not_started",
        cost_pence: DBS_COST_PENCE,
      })),
    );
  }

  await admin
    .from("caregiver_profiles")
    .update({ dbs_overall_status: "in_progress", dbs_search_eligible: false })
    .eq("user_id", carerId);
}

/**
 * Submit one application (adult or child) to the vendor and flip the row to
 * 'submitted'. Creates the row if initiate hasn't run yet.
 */
export async function submitDbsApplication(
  carerId: string,
  kind: DbsKind,
  carerDetails: DbsCarerDetails,
): Promise<{ vendorReference: string }> {
  if (!isDbsEnabled()) throw new DbsDisabledError();
  const admin = client();
  const vendor = getDbsVendor();

  // Cross-check the carer-entered name/DOB against their Veriff-confirmed
  // identity before submitting. A failure blocks submission and surfaces a
  // "Names don't match — admin will review" message to the carer. No-op pass
  // when the carer has no completed Veriff verification.
  const crossCheck = await crossCheckDbsAgainstVeriff(carerId, {
    surname: carerDetails.surname,
    dateOfBirth: carerDetails.dateOfBirth,
  });
  if (!crossCheck.ok) {
    throw new DbsCrossCheckError(crossCheck.mismatches);
  }

  const { vendorReference } = await vendor.submitApplication({
    carerId,
    kind,
    carerDetails,
  });

  const nowIso = new Date().toISOString();
  const { data: row } = await admin
    .from("dbs_applications")
    .select("id")
    .eq("carer_id", carerId)
    .eq("kind", kind)
    .maybeSingle();

  if (row) {
    await admin
      .from("dbs_applications")
      .update({
        vendor: vendor.name,
        vendor_reference: vendorReference,
        status: "submitted",
        submitted_at: nowIso,
      })
      .eq("id", row.id);
  } else {
    await admin.from("dbs_applications").insert({
      carer_id: carerId,
      kind,
      vendor: vendor.name,
      vendor_reference: vendorReference,
      status: "submitted",
      submitted_at: nowIso,
      cost_pence: DBS_COST_PENCE,
    });
  }

  await recomputeOverallStatus(carerId);
  return { vendorReference };
}

/**
 * Admin records a manual approve/reject decision against an application.
 * On approve, the certificate details are recorded. Recomputes the carer's
 * overall status afterwards.
 */
export async function recordManualDecision(
  applicationId: string,
  decision: "approved" | "rejected",
  adminUserId: string,
  certificateNumber?: string,
  certificateIssuedOn?: string,
): Promise<void> {
  if (!isDbsEnabled()) throw new DbsDisabledError();
  const admin = client();

  const { data: app } = await admin
    .from("dbs_applications")
    .select("id, carer_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) throw new Error(`DBS application ${applicationId} not found`);

  await admin
    .from("dbs_applications")
    .update({
      status: decision,
      decision_at: new Date().toISOString(),
      certificate_number:
        decision === "approved" ? (certificateNumber ?? null) : null,
      certificate_issued_on:
        decision === "approved" ? (certificateIssuedOn ?? null) : null,
    })
    .eq("id", applicationId);

  // Best-effort audit trail (admin_audit_log).
  try {
    const { logAdminAction } = await import("@/lib/admin/auth");
    await logAdminAction({
      admin: { id: adminUserId, email: null },
      action: `dbs.${decision}`,
      targetType: "dbs_application",
      targetId: applicationId,
      details: { certificateNumber, certificateIssuedOn },
    });
  } catch {
    // logging must never break the decision
  }

  await recomputeOverallStatus(app.carer_id as string);
}

/**
 * Pure roll-up: given the adult + child application statuses, compute the
 * carer's overall status and search eligibility. Search-eligible only when
 * BOTH are approved. Exported for unit testing.
 */
export function computeOverall(
  adult: DbsStatus | null,
  child: DbsStatus | null,
): { overall: DbsOverallStatus; searchEligible: boolean } {
  const both = [adult, child];

  // Any rejection blocks the carer outright.
  if (both.includes("rejected")) {
    return { overall: "rejected", searchEligible: false };
  }
  // Both approved → live.
  if (adult === "approved" && child === "approved") {
    return { overall: "approved", searchEligible: true };
  }
  // Any expiry (and nothing rejected) → expired.
  if (both.includes("expired")) {
    return { overall: "expired", searchEligible: false };
  }
  // Nothing started on either side.
  if (
    (adult === null || adult === "not_started") &&
    (child === null || child === "not_started")
  ) {
    return { overall: "not_started", searchEligible: false };
  }
  // Anything else (submitted / in_progress / one approved) → in_progress.
  return { overall: "in_progress", searchEligible: false };
}

/**
 * Read the carer's adult + child rows, recompute overall status + search
 * eligibility, and persist them on caregiver_profiles.
 */
export async function recomputeOverallStatus(
  carerId: string,
): Promise<{ overall: DbsOverallStatus; searchEligible: boolean }> {
  if (!isDbsEnabled()) throw new DbsDisabledError();
  const admin = client();

  const { data: rows } = await admin
    .from("dbs_applications")
    .select("kind, status")
    .eq("carer_id", carerId);

  const byKind = new Map<DbsKind, DbsStatus>();
  for (const r of (rows ?? []) as Array<{ kind: DbsKind; status: DbsStatus }>) {
    byKind.set(r.kind, r.status);
  }

  const result = computeOverall(
    byKind.get("adult") ?? null,
    byKind.get("child") ?? null,
  );

  await admin
    .from("caregiver_profiles")
    .update({
      dbs_overall_status: result.overall,
      dbs_search_eligible: result.searchEligible,
    })
    .eq("user_id", carerId);

  return result;
}

/**
 * Carer opts to pay the £60 upfront instead of earnings recovery. Marks both
 * applications 'paid_upfront' and creates a £60 Stripe PaymentIntent the carer
 * UI confirms. Returns the PaymentIntent client secret.
 */
export async function chooseUpfrontPayment(
  carerId: string,
): Promise<{ clientSecret: string | null; amountPence: number }> {
  if (!isDbsEnabled()) throw new DbsDisabledError();
  const admin = client();

  // Stripe is imported lazily so this module loads without STRIPE_SECRET_KEY
  // (e.g. in unit tests that never call this path).
  const { stripe } = await import("@/lib/stripe/server");
  const intent = await stripe.paymentIntents.create({
    amount: DBS_COST_PENCE,
    currency: "gbp",
    metadata: { purpose: "dbs_upfront", carer_id: carerId },
    description: "SpecialCarers DBS application (paid upfront)",
  });

  await admin
    .from("dbs_applications")
    .update({ recovery_status: "paid_upfront" })
    .eq("carer_id", carerId)
    .in("recovery_status", ["pending", "recovering"]);

  return { clientSecret: intent.client_secret ?? null, amountPence: DBS_COST_PENCE };
}

/**
 * Self-verify path: a carer who already holds a live Update-Service DBS gives
 * us their certificate number + DOB; we validate it via the vendor's Update
 * Service API. On a 'clear' result we create an approved, Update-Service-
 * enrolled application for the requested kind with recovery waived (SC didn't
 * front the £60). Anything else returns invalid so the carer is steered to the
 * standard application path.
 *
 * Returns { ok } on success or { ok:false, reason } on an invalid certificate.
 */
export async function selfVerifyExistingDbs(
  carerId: string,
  input: {
    certificateNumber: string;
    kind: DbsKind;
    dateOfBirth: string;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isDbsEnabled()) throw new DbsDisabledError();
  const admin = client();
  const vendor = getDbsVendor();

  const { status } = await vendor.getUpdateServiceStatus(
    input.certificateNumber,
  );
  if (status !== "clear") {
    return {
      ok: false,
      reason:
        "We couldn't confirm this certificate on the DBS Update Service. Please apply through the standard path.",
    };
  }

  const nowIso = new Date().toISOString();
  const { data: existing } = await admin
    .from("dbs_applications")
    .select("id")
    .eq("carer_id", carerId)
    .eq("kind", input.kind)
    .maybeSingle();

  const patch = {
    vendor: vendor.name,
    status: "approved" as DbsStatus,
    certificate_number: input.certificateNumber,
    update_service_enrolled: true,
    update_service_last_checked_at: nowIso,
    decision_at: nowIso,
    recovery_status: "waived",
  };

  if (existing) {
    await admin.from("dbs_applications").update(patch).eq("id", existing.id);
  } else {
    await admin.from("dbs_applications").insert({
      carer_id: carerId,
      kind: input.kind,
      cost_pence: 0,
      ...patch,
    });
  }

  await recomputeOverallStatus(carerId);
  return { ok: true };
}

/** Read a carer's applications for the carer-facing + admin UIs. */
export async function getCarerDbsApplications(carerId: string) {
  const admin = client();
  const { data } = await admin
    .from("dbs_applications")
    .select(
      "id, kind, status, vendor, vendor_reference, submitted_at, decision_at, certificate_number, certificate_issued_on, recovery_status, recovery_collected_pence, cost_pence, created_at",
    )
    .eq("carer_id", carerId)
    .order("kind", { ascending: true });
  return data ?? [];
}
