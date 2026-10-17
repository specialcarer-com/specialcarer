/**
 * Guards for the manual-verification migration: additive only, RLS on, the
 * bucket private, and no client write path.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SQL = readFileSync(new URL("./20261016020000_verification_submissions.sql", import.meta.url), "utf8");
const CODE = SQL.replace(/--.*$/gm, "");

describe("verification_submissions migration", () => {
  it("is additive: no destructive statements", () => {
    assert.doesNotMatch(CODE, /\bdrop\s+(table|column|index|constraint|schema|function|trigger|policy)\b/i);
    assert.doesNotMatch(CODE, /\btruncate\b/i);
    assert.doesNotMatch(CODE, /\bdelete\s+from\b/i);
  });
  it("enables row level security and only lets owners read", () => {
    assert.match(CODE, /alter table public\.verification_submissions enable row level security/i);
    assert.match(CODE, /for select to authenticated/i);
    assert.doesNotMatch(CODE, /for (insert|update|delete|all)\b/i);
  });
  it("allows only one open submission per carer and kind", () => {
    assert.match(CODE, /create unique index if not exists verification_submissions_one_open[\s\S]*where status = 'submitted'/i);
  });
  it("creates a private bucket with no storage policies", () => {
    assert.match(CODE, /'verification-docs', 'verification-docs', false/);
    assert.doesNotMatch(CODE, /storage\.objects/i);
    assert.doesNotMatch(CODE, /\|\|/);
  });
});
