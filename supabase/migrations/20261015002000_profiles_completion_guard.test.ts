/**
 * Regression guard: a finished profile must not be able to blank its name or
 * country from a client session (that would re-open the onboarding side switch).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SQL = readFileSync(
  new URL("./20261015002000_profiles_completion_guard.sql", import.meta.url),
  "utf8",
);
const CODE = SQL.replace(/--.*$/gm, "");

describe("profiles completion guard migration", () => {
  it("replaces the existing guard function and keeps it client-only", () => {
    assert.match(CODE, /create or replace function public\.profiles_role_guard\(\)/);
    assert.match(CODE, /current_user not in \('authenticated', 'anon'\)/);
  });

  it("blocks clearing name or country on a complete carer/family profile", () => {
    assert.match(CODE, /old\.role::text in \('seeker', 'caregiver'\)\s+and coalesce\(nullif\(trim\(old\.full_name\), ''\), ''\) <> ''/);
    assert.match(CODE, /nullif\(trim\(new\.full_name\), ''\), ''\) = ''/);
    assert.match(CODE, /nullif\(trim\(new\.country\), ''\), ''\) = ''/);
    assert.match(CODE, /errcode = '42501'/);
  });

  it("keeps the onboarding side switch for incomplete profiles and the insert rule", () => {
    assert.match(CODE, /new\.role::text not in \('seeker', 'caregiver', 'organization'\)/);
    assert.match(CODE, /profiles\.role cannot be changed from a client session/);
  });

  it("follows the migration rules: non-destructive, no || in DDL", () => {
    assert.doesNotMatch(CODE, /\b(drop|truncate)\b/i);
    assert.doesNotMatch(CODE, /\|\|/);
  });
});
