/**
 * Regression guard: server-managed profile columns must not be writable from a
 * client session, while the columns users really edit stay writable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SQL = readFileSync(
  new URL("./20261016001000_profiles_protected_columns.sql", import.meta.url),
  "utf8",
);
const CODE = SQL.replace(/--.*$/gm, "");

const PROTECTED = [
  "organization_id",
  "email",
  "tax_code",
  "ni_number",
  "agency_opt_in_status",
  "agency_opt_in_started_at",
  "agency_opt_in_submitted_at",
  "agency_opt_in_approved_at",
  "agency_opt_in_approved_by",
  "agency_opt_in_rejected_reason",
  "agency_opt_in_paused_reason",
  "works_with_adults",
  "works_with_children",
  "works_with_children_admin_approved_at",
  "agency_optin_grace_period_until",
  "compliance_blast_sent_at",
  "mfa_required",
  "mfa_grace_period_ends_at",
  "created_at",
];

const USER_EDITABLE = [
  "full_name",
  "phone",
  "locale",
  "country",
  "avatar_url",
  "updated_at",
  "chat_translate_to",
  "calendar_token",
];

describe("profiles protected columns migration", () => {
  it("replaces the guard and stays client-session only", () => {
    assert.match(CODE, /create or replace function public\.profiles_role_guard\(\)/);
    assert.match(CODE, /current_user not in \('authenticated', 'anon'\)/);
  });

  it("blocks changes to every server-managed column on update", () => {
    for (const col of PROTECTED) {
      assert.match(
        CODE,
        new RegExp(`new\\.${col} is distinct from old\\.${col}`),
        `${col} should be locked on update`,
      );
    }
  });

  it("requires server-managed columns to be defaults on insert", () => {
    for (const col of ["organization_id", "email", "tax_code", "ni_number", "agency_opt_in_approved_at", "works_with_children_admin_approved_at", "mfa_grace_period_ends_at"]) {
      assert.match(CODE, new RegExp(`new\\.${col} is not null`), `${col} insert check`);
    }
    assert.match(CODE, /new\.agency_opt_in_status::text <> 'not_started'/);
    assert.match(CODE, /new\.mfa_required is distinct from false/);
  });

  it("does not lock the columns people edit themselves", () => {
    for (const col of USER_EDITABLE) {
      assert.doesNotMatch(
        CODE,
        new RegExp(`new\\.${col} is distinct from old\\.${col}`),
        `${col} must stay writable`,
      );
    }
  });

  it("keeps the role rules and completion guard from earlier migrations", () => {
    assert.match(CODE, /profiles\.role cannot be changed from a client session/);
    assert.match(CODE, /profiles name and country cannot be cleared from a client session/);
    assert.match(CODE, /new\.role::text not in \('seeker', 'caregiver', 'organization'\)/);
  });

  it("follows the migration rules: non-destructive, no || in DDL", () => {
    assert.doesNotMatch(CODE, /\b(drop|truncate)\b/i);
    assert.doesNotMatch(CODE, /\|\|/);
  });
});
