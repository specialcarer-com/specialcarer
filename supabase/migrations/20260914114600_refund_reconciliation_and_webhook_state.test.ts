/**
 * E1 — Migration static regression guards.
 *
 * We can't spin up a live Postgres inside `node --test`, so we assert
 * the migration file's shape at a source level. Same pattern as
 * 20260911220000_rls_audit_close_leaks.test.ts (PR B1).
 *
 * Guards:
 *   - Two new enums, spelled exactly as the discovery block says.
 *   - Additive-only: no DROP, no TRUNCATE, no ALTER ... DROP, no
 *     Allow-Destructive markers (this PR is additive).
 *   - The three backfill UPDATEs are guarded on `state = 'pending'`
 *     so replays don't shift already-set rows (idempotency).
 *   - The three enum-add / column-add / index-add / table-add DDL
 *     statements use IF NOT EXISTS or DO / EXISTS guards so replaying
 *     the migration against a scratch DB is a no-op after the first
 *     run.
 *   - No `||` inside DDL literal clauses (D5 §7.5 rule).
 *   - No `drop policy if exists` (banned by PR #220's preflight gate).
 *   - No `rm` / `ni` role literals (Phase A–D operating rule).
 *   - The refund_reconciliation table has NO RLS enable (service-role
 *     only; admin surfaces gate via requireAdmin() server-side).
 *   - The partial index on stripe_webhook_events matches the
 *     payments_capture_claim_idx style (partial WHERE state='pending').
 *   - The state_open_idx partial predicate lists exactly the three
 *     open states the plan calls out.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "./20260914114600_refund_reconciliation_and_webhook_state.sql",
  import.meta.url,
);

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function stripSqlComments(src: string): string {
  return src.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("E1 migration — enums", () => {
  const src = stripSqlComments(readMigration());

  it("creates public.webhook_event_state with the four states in order", () => {
    assert.match(
      src,
      /CREATE TYPE public\.webhook_event_state AS ENUM\s*\(\s*'pending'\s*,\s*'processing'\s*,\s*'completed'\s*,\s*'failed'\s*\)/,
    );
  });

  it("creates public.refund_reconciliation_state with the five states in order", () => {
    assert.match(
      src,
      /CREATE TYPE public\.refund_reconciliation_state AS ENUM\s*\(\s*'initiated'\s*,\s*'partial'\s*,\s*'fully_refunded'\s*,\s*'mismatch'\s*,\s*'reconciled'\s*\)/,
    );
  });

  it("guards both enum creations with EXISTS-checked DO blocks (idempotency)", () => {
    // Two DO $$ blocks, each with an IF NOT EXISTS check on pg_type.
    const doBlocks = src.match(/DO \$\$[\s\S]*?END\$\$;/g) ?? [];
    assert.ok(
      doBlocks.length >= 2,
      `expected ≥2 DO blocks, found ${doBlocks.length}`,
    );
    for (const block of doBlocks.slice(0, 2)) {
      assert.match(block, /IF NOT EXISTS/);
      assert.match(block, /pg_type/);
    }
  });
});

describe("E1 migration — stripe_webhook_events state column", () => {
  const src = stripSqlComments(readMigration());

  it("adds the column via ADD COLUMN IF NOT EXISTS with the pending default", () => {
    assert.match(
      src,
      /ALTER TABLE public\.stripe_webhook_events\s+ADD COLUMN IF NOT EXISTS state public\.webhook_event_state\s+NOT NULL DEFAULT 'pending'/,
    );
  });

  it("backfills all three (processed_at, error) cases with state='pending' WHERE guards (idempotency)", () => {
    // Case A: processed_at NOT NULL AND error IS NULL → 'completed'
    assert.match(
      src,
      /UPDATE public\.stripe_webhook_events\s+SET state = 'completed'\s+WHERE state = 'pending'\s+AND processed_at IS NOT NULL\s+AND error IS NULL/,
    );
    // Case B: processed_at IS NULL AND error IS NOT NULL → 'failed'
    assert.match(
      src,
      /UPDATE public\.stripe_webhook_events\s+SET state = 'failed'\s+WHERE state = 'pending'\s+AND processed_at IS NULL\s+AND error IS NOT NULL/,
    );
    // Case C: ambiguous → 'failed'
    assert.match(
      src,
      /UPDATE public\.stripe_webhook_events\s+SET state = 'failed'\s+WHERE state = 'pending'\s+AND processed_at IS NOT NULL\s+AND error IS NOT NULL/,
    );
  });

  it("adds the partial pending-state index mirroring payments_capture_claim_idx", () => {
    assert.match(
      src,
      /CREATE INDEX IF NOT EXISTS stripe_webhook_events_state_pending_idx\s+ON public\.stripe_webhook_events \(created_at\)\s+WHERE state = 'pending'/,
    );
  });
});

describe("E1 migration — refund_reconciliation table", () => {
  const src = stripSqlComments(readMigration());

  it("creates the table with IF NOT EXISTS", () => {
    assert.match(src, /CREATE TABLE IF NOT EXISTS public\.refund_reconciliation/);
  });

  it("declares all required columns", () => {
    const required = [
      /id\s+uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
      /booking_id\s+uuid NOT NULL\s+REFERENCES public\.bookings\(id\)/,
      /stripe_refund_id\s+text NOT NULL UNIQUE/,
      /stripe_payment_intent_id\s+text NOT NULL/,
      /expected_amount_cents\s+integer NOT NULL/,
      /observed_amount_cents\s+integer/,
      /currency\s+text NOT NULL/,
      /state\s+public\.refund_reconciliation_state\s+NOT NULL DEFAULT 'initiated'/,
      /initiated_at\s+timestamptz NOT NULL DEFAULT now\(\)/,
      /reconciled_at\s+timestamptz/,
      /mismatch_reason\s+text/,
      /raw\s+jsonb NOT NULL DEFAULT '\{\}'::jsonb/,
    ];
    for (const r of required) assert.match(src, r);
  });

  it("adds all three indexes (booking, PI, state-open partial)", () => {
    assert.match(
      src,
      /CREATE INDEX IF NOT EXISTS refund_reconciliation_booking_idx\s+ON public\.refund_reconciliation \(booking_id\)/,
    );
    assert.match(
      src,
      /CREATE INDEX IF NOT EXISTS refund_reconciliation_pi_idx\s+ON public\.refund_reconciliation \(stripe_payment_intent_id\)/,
    );
    assert.match(
      src,
      /CREATE INDEX IF NOT EXISTS refund_reconciliation_state_open_idx[\s\S]*WHERE state IN \('initiated', 'partial', 'mismatch'\)/,
    );
  });

  it("does NOT enable RLS on refund_reconciliation (service-role only)", () => {
    assert.doesNotMatch(
      src,
      /ALTER TABLE public\.refund_reconciliation\s+ENABLE ROW LEVEL SECURITY/i,
    );
    assert.doesNotMatch(src, /CREATE POLICY .* ON public\.refund_reconciliation/i);
  });
});

describe("E1 migration — governance rules", () => {
  const rawSrc = readMigration();
  const src = stripSqlComments(rawSrc);

  it("is fully additive — no DROP, no TRUNCATE, no ALTER ... DROP", () => {
    assert.doesNotMatch(src, /\bDROP\s+(TABLE|COLUMN|POLICY|INDEX|TYPE)\b/i);
    assert.doesNotMatch(src, /\bTRUNCATE\b/i);
    assert.doesNotMatch(src, /ALTER TABLE .* DROP/i);
  });

  it("does not include an Allow-Destructive trailer / marker in comments", () => {
    assert.doesNotMatch(rawSrc, /Allow-Destructive:\s*true/i);
  });

  it("does not use `drop policy if exists` anywhere (banned by PR #220)", () => {
    assert.doesNotMatch(src, /drop\s+policy\s+if\s+exists/i);
  });

  it("does not use `||` concatenation inside DDL literal clauses (D5 §7.5 rule)", () => {
    // Scan every `COMMENT ON ... IS '...'`, `SET x = '...'`, and
    // `DEFAULT '...'` for a `||` inside the single-quoted string.
    const literalStatements =
      src.match(/(COMMENT ON [^;]+|SET [^;]+|DEFAULT '[^']*')/gi) ?? [];
    for (const stmt of literalStatements) {
      assert.doesNotMatch(
        stmt,
        /\|\|/,
        `Found '||' inside DDL literal — D5 §7.5 rule: ${stmt}`,
      );
    }
  });

  it("has no `rm` or `ni` role literals", () => {
    // Word-boundary matches so we don't false-hit on 'from', 'IN', etc.
    assert.doesNotMatch(src, /['"]rm['"]/);
    assert.doesNotMatch(src, /['"]ni['"]/);
  });
});

describe("E1 migration — idempotency shape (source-level)", () => {
  const src = stripSqlComments(readMigration());

  it("every schema-creating statement is guarded (IF NOT EXISTS or EXISTS-checked DO)", () => {
    // CREATE TYPE guarded by DO blocks above.
    // ADD COLUMN, CREATE TABLE, all CREATE INDEXes must use IF NOT EXISTS.
    const addColumn = src.match(/ALTER TABLE [^;]*ADD COLUMN [^;]+;/g) ?? [];
    for (const s of addColumn) assert.match(s, /IF NOT EXISTS/);
    const createIndex = src.match(/CREATE (UNIQUE )?INDEX [^;]+;/g) ?? [];
    for (const s of createIndex) assert.match(s, /IF NOT EXISTS/);
    const createTable = src.match(/CREATE TABLE [^;]+;/g) ?? [];
    for (const s of createTable) assert.match(s, /IF NOT EXISTS/);
  });

  it("the three backfill UPDATEs are guarded on the still-pending state so replays are no-ops", () => {
    const updates = src.match(/UPDATE public\.stripe_webhook_events[\s\S]*?;/g) ?? [];
    assert.equal(updates.length, 3, `expected 3 backfill UPDATEs, found ${updates.length}`);
    for (const u of updates) assert.match(u, /WHERE state = 'pending'/);
  });
});
