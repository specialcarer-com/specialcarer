/**
 * Regression guards for the profiles.role privilege fix.
 *
 * No live Postgres inside `node --test`, so we assert the migration says the
 * right things and that the app's own sign-up paths stay compatible with it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SQL = readFileSync(
  new URL("./20261015001000_profiles_role_privilege_guard.sql", import.meta.url),
  "utf8",
);
// Ignore comments so wording in the header cannot satisfy or break an assertion.
const CODE = SQL.replace(/--.*$/gm, "");

describe("profiles role privilege guard migration", () => {
  it("no longer lets sign-up metadata choose admin", () => {
    assert.match(CODE, /meta_role in \('seeker', 'caregiver', 'organization'\)/);
    assert.doesNotMatch(CODE, /meta_role in \([^)]*'admin'/);
  });

  it("installs a before insert/update guard trigger on profiles", () => {
    assert.match(CODE, /create trigger profiles_role_guard_trg\s+before insert or update on public\.profiles/);
    assert.match(CODE, /for each row execute function public\.profiles_role_guard\(\)/);
  });

  it("only constrains direct API sessions", () => {
    assert.match(CODE, /current_user not in \('authenticated', 'anon'\)/);
  });

  it("blocks admin on insert and role changes after onboarding", () => {
    assert.match(CODE, /new\.role::text not in \('seeker', 'caregiver', 'organization'\)/);
    assert.match(CODE, /old\.role::text in \('seeker', 'caregiver'\)/);
    assert.match(CODE, /new\.role::text in \('seeker', 'caregiver'\)/);
    assert.match(CODE, /errcode = '42501'/);
  });

  it("follows the migration rules: idempotent, non-destructive, no || in DDL", () => {
    assert.doesNotMatch(CODE, /\bdrop\s+(table|column|index|constraint|schema|function|trigger|policy)\b/i);
    assert.doesNotMatch(CODE, /\btruncate\b/i);
    assert.doesNotMatch(CODE, /\|\|/);
    assert.match(CODE, /create or replace function public\.handle_new_user/);
    assert.match(CODE, /if not exists \(\s+select 1 from pg_trigger/);
  });
});

describe("app sign-up paths stay compatible with the guard", () => {
  it("the family/carer/organisation sign-up form only requests non-admin roles", () => {
    const form = readFileSync(
      new URL("../../src/app/signup/signup-form.tsx", import.meta.url),
      "utf8",
    );
    const map = form.slice(form.indexOf("ROLE_FOR_AUDIENCE"), form.indexOf("ROLE_FOR_AUDIENCE") + 400);
    assert.doesNotMatch(map, /admin/);
  });

  it("onboarding only offers seeker and caregiver", () => {
    const form = readFileSync(
      new URL("../../src/app/onboarding/onboarding-form.tsx", import.meta.url),
      "utf8",
    );
    // The value written to profiles.role comes from this state only.
    assert.match(form, /useState<"seeker" \| "caregiver">/);
  });
});
