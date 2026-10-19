/**
 * Guards for the views hardening migration: only ALTER VIEW SET security_invoker
 * and REVOKE ... FROM authenticated; nothing destructive; nothing granted.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SQL = readFileSync(new URL("./20261018190000_views_respect_row_security.sql", import.meta.url), "utf8");
const CODE = SQL.replace(/--.*$/gm, "");
const STATEMENTS = CODE.split(";").map((s) => s.trim()).filter(Boolean);

const INVOKER = [
  "carer_positions_latest",
  "user_current_plan",
  "v_holiday_pot_balances",
  "v_user_activity_feed",
  "v_user_credit_balance",
  "caregiver_verification",
];
const ADMIN_ONLY = [
  "ai_anomaly_queue_v",
  "v_agency_opt_in_gates",
  "v_carer_doc_compliance",
  "v_carer_pipeline_funnel",
  "v_carer_referral_funnel",
  "v_carer_referral_leaderboard",
  "v_carer_sourcing_funnel",
  "v_instant_ready_carers",
];

describe("views respect row security migration", () => {
  it("contains only the two expected statement shapes", () => {
    for (const s of STATEMENTS) {
      assert.match(
        s,
        /^(alter view public\.[a-z_]+ set \(security_invoker = true\)|revoke all on public\.[a-z_]+ from authenticated)$/i,
      );
    }
  });
  it("never grants anything or touches service_role", () => {
    assert.doesNotMatch(CODE, /\bgrant\b/i);
    assert.doesNotMatch(CODE, /service_role/i);
  });
  it("makes every per-user view security_invoker", () => {
    for (const v of INVOKER) {
      assert.match(CODE, new RegExp(`alter view public\\.${v} set \\(security_invoker = true\\)`));
    }
  });
  it("revokes authenticated from every admin-only view", () => {
    for (const v of ADMIN_ONLY) {
      assert.match(CODE, new RegExp(`revoke all on public\\.${v} from authenticated`));
    }
  });
  it("keeps the two groups disjoint", () => {
    for (const v of INVOKER) assert.ok(!ADMIN_ONLY.includes(v));
  });
});
