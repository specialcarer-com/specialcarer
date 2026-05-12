/**
 * Manual-admin DBS Update Service provider.
 *
 * Used when no programmatic Update Service API is available (current
 * default). verifyUpdateService() returns `manual_pending` so the
 * carer's gate stays red until an admin opens the carer's profile,
 * verifies on https://secure.crbonline.gov.uk/enquiry/enquirySearch.do
 * and clicks "Verified" — which writes the corresponding rows via
 * /api/admin/dbs-update-service/verify.
 */

import type {
  DbsProvider,
  InitiateFreshDbsArgs,
  UpdateServiceCheckResult,
  VerifyUpdateServiceInput,
} from "../provider";

export const manualAdminProvider: DbsProvider = {
  name: "manual",
  async verifyUpdateService(
    args: VerifyUpdateServiceInput
  ): Promise<UpdateServiceCheckResult> {
    return {
      ok: false,
      reason: "manual_pending",
      raw: {
        submitted: {
          carerLegalName: args.carerLegalName,
          certificateNumber: args.certificateNumber,
          subscriptionId: args.subscriptionId,
          workforceType: args.workforceType,
        },
        next_step:
          "Admin will verify on https://secure.crbonline.gov.uk/enquiry/enquirySearch.do",
      },
    };
  },
  async initiateFreshDbs(_args: InitiateFreshDbsArgs) {
    return { providerCheckId: "delegated_to_request_dbs_route" };
  },
};
