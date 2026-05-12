/**
 * Checkr-backed DBS Update Service provider.
 *
 * Status (2026-05): Checkr's UK product
 * (https://checkr.com/customers/uk, https://docs.checkr.com/) covers
 * fresh Enhanced DBS via their UK partner network but does NOT publish
 * a public Update Service status-check API. This module is wired so
 * that when Checkr exposes that endpoint (env var
 * CHECKR_UK_UPDATE_SERVICE_URL), we can flip the provider env to
 * 'checkr' without further code changes. Until then the call returns
 * { ok:false, reason:'provider_error' } and the caller falls back to
 * the manual-admin path.
 */

import type {
  DbsProvider,
  InitiateFreshDbsArgs,
  UpdateServiceCheckResult,
  VerifyUpdateServiceInput,
} from "../provider";

const apiKey = process.env.CHECKR_API_KEY ?? "";
const usEndpoint = process.env.CHECKR_UK_UPDATE_SERVICE_URL ?? "";

async function callCheckrUs(
  input: VerifyUpdateServiceInput
): Promise<UpdateServiceCheckResult> {
  if (!apiKey || !usEndpoint) {
    return {
      ok: false,
      reason: "provider_error",
      raw: {
        message:
          "Checkr UK Update Service API not configured (CHECKR_API_KEY or CHECKR_UK_UPDATE_SERVICE_URL missing). Use DBS_UPDATE_SERVICE_PROVIDER=manual.",
      },
    };
  }
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  try {
    const res = await fetch(usEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        legal_name: input.carerLegalName,
        date_of_birth: input.dateOfBirth,
        certificate_number: input.certificateNumber,
        subscription_id: input.subscriptionId,
        workforce_type: input.workforceType,
      }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, reason: "provider_error", raw };
    }
    // Shape assumption — Checkr's eventual response is expected to
    // include { status: 'current'|'changed' }. We treat anything else
    // as 'provider_error'.
    const status = typeof raw?.status === "string" ? raw.status : null;
    if (status === "current" || status === "changed") {
      return { ok: true, status, raw, checkedAt: new Date() };
    }
    if (status === "no_subscription") {
      return { ok: false, reason: "no_subscription", raw };
    }
    if (status === "expired") {
      return { ok: false, reason: "expired", raw };
    }
    return { ok: false, reason: "provider_error", raw };
  } catch (e) {
    return {
      ok: false,
      reason: "provider_error",
      raw: { message: e instanceof Error ? e.message : String(e) },
    };
  }
}

export const checkrUpdateServiceProvider: DbsProvider = {
  name: "checkr",
  verifyUpdateService(args: VerifyUpdateServiceInput) {
    return callCheckrUs(args);
  },
  async initiateFreshDbs(_args: InitiateFreshDbsArgs) {
    // Existing fresh-Checkr path is owned by src/lib/checkr/server.ts +
    // /api/agency-optin/request-dbs. We expose a stub here so the
    // interface is satisfied; callers should keep using the existing
    // path for fresh DBS.
    return { providerCheckId: "delegated_to_request_dbs_route" };
  },
};
