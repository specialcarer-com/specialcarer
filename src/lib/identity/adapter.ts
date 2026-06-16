import { createAdminClient } from "@/lib/supabase/admin";
import { createSession as veriffCreateSession } from "./veriff";
import {
  type IdentityClient,
  type IdentityVerificationRow,
} from "./identity-handler";

const ROW_COLUMNS =
  "id, user_id, veriff_session_id, status, decision_json, vendor_data, verification_url, created_at, updated_at";

/**
 * Thin Supabase + Veriff adapter shared by the identity routes. Ownership,
 * idempotency, and the flag gate all live in the pure handlers; reads/writes
 * use the admin (service-role) client because session provisioning and webhook
 * ingestion are server-trusted actions.
 */
export function buildIdentityClient(): IdentityClient {
  const admin = createAdminClient();
  return {
    async getLatestForUser(userId) {
      const { data, error } = await admin
        .from("identity_verifications")
        .select(ROW_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<IdentityVerificationRow>();
      return { data, error };
    },
    async getById(id) {
      const { data, error } = await admin
        .from("identity_verifications")
        .select(ROW_COLUMNS)
        .eq("id", id)
        .maybeSingle<IdentityVerificationRow>();
      return { data, error };
    },
    async getBySessionId(sessionId) {
      const { data, error } = await admin
        .from("identity_verifications")
        .select(ROW_COLUMNS)
        .eq("veriff_session_id", sessionId)
        .maybeSingle<IdentityVerificationRow>();
      return { data, error };
    },
    async createSession({ userId }) {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle<{ full_name: string | null }>();
      const [firstName, ...rest] = (profile?.full_name ?? "").trim().split(" ");
      const session = await veriffCreateSession({
        person: {
          firstName: firstName || undefined,
          lastName: rest.length ? rest.join(" ") : undefined,
        },
        vendorData: userId,
      });
      return { id: session.id, url: session.url };
    },
    async insertRow(input) {
      const { data, error } = await admin
        .from("identity_verifications")
        .insert({
          user_id: input.userId,
          veriff_session_id: input.sessionId,
          status: "created",
          verification_url: input.verificationUrl,
          vendor_data: input.vendorData,
        })
        .select(ROW_COLUMNS)
        .maybeSingle<IdentityVerificationRow>();
      return { data, error };
    },
    async updateFromWebhook(input) {
      const { error } = await admin
        .from("identity_verifications")
        .update({
          status: input.status,
          decision_json: input.decisionJson,
        })
        .eq("veriff_session_id", input.sessionId);
      return { error };
    },
  };
}
