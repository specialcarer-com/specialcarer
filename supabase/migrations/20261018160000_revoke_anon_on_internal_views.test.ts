/**
 * Guards for the anon-revoke migration: only REVOKE from anon, nothing
 * destructive, and the sensitive views are all covered.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SQL = readFileSync(new URL("./20261018160000_revoke_anon_on_internal_views.sql", import.meta.url), "utf8");
const CODE = SQL.replace(/--.*$/gm, "");
const STATEMENTS = CODE.split(";").map((s) => s.trim()).filter(Boolean);

describe("revoke anon on internal views migration", () => {
  it("contains only REVOKE ... FROM anon statements", () => {
    assert.ok(STATEMENTS.length >= 14);
    for (const s of STATEMENTS) {
      assert.match(s, /^revoke all on public\.[a-z_]+ from anon$/i);
    }
  });
  it("never touches authenticated or service_role", () => {
    assert.doesNotMatch(CODE, /authenticated|service_role/i);
  });
  it("covers the views that expose positions, identities and compliance", () => {
    for (const v of [
      "carer_positions_latest",
      "v_carer_doc_compliance",
      "v_carer_referral_leaderboard",
      "caregiver_verification",
      "v_agency_opt_in_gates",
      "v_user_credit_balance",
      "ai_anomaly_queue_v",
    ]) {
      assert.match(CODE, new RegExp(`revoke all on public\\.${v} from anon`));
    }
  });
});
