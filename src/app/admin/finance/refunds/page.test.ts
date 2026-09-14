/**
 * E1 — Admin refunds page auth-gate + schema-not-ready guard tests.
 *
 * We can't render a Next server component in `node --test` (no Next
 * runtime), so we mirror the D5 admin-page test pattern: verify the
 * source file's structure, imports, and gate mechanics against a
 * regression suite.
 *
 * Specifically:
 *   - `requireAdmin()` is imported from `@/lib/admin/auth` (the shared
 *     gate that also enforces MFA/AAL2).
 *   - The component calls `await requireAdmin()` before ANY data read.
 *   - The service-role `createAdminClient()` is used (this is the RLS-
 *     agnostic path — the auth gate is the only protection).
 *   - The route hard-codes `dynamic = 'force-dynamic'` so per-request
 *     auth actually runs.
 *   - A schema_not_ready branch exists so the page doesn't 500 during
 *     the deploy → migration-apply window.
 *   - No action buttons / Stripe deeplinks (read-only).
 *   - The tabs component gates the "Refunds" nav link behind
 *     NEXT_PUBLIC_ADMIN_FINANCE_V2.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const PAGE_PATH = new URL("./page.tsx", import.meta.url);
const TABS_PATH = new URL("../_tabs.tsx", import.meta.url);

function read(path: URL): string {
  return readFileSync(path, "utf8");
}

describe("admin/finance/refunds page — auth gate", () => {
  const src = read(PAGE_PATH);

  it("imports requireAdmin from the shared auth module", () => {
    assert.match(src, /from ["']@\/lib\/admin\/auth["']/);
    assert.match(src, /\brequireAdmin\b/);
  });

  it("awaits requireAdmin() BEFORE constructing the admin client", () => {
    const requireIdx = src.indexOf("await requireAdmin(");
    const clientIdx = src.indexOf("createAdminClient(");
    assert.ok(requireIdx > -1, "requireAdmin call not found");
    assert.ok(clientIdx > -1, "createAdminClient call not found");
    assert.ok(
      requireIdx < clientIdx,
      "requireAdmin() must be awaited before createAdminClient()",
    );
  });

  it("forces dynamic rendering so auth actually runs per request", () => {
    assert.match(src, /export const dynamic = ["']force-dynamic["']/);
  });

  it("is read-only — no <button>, <form>, or Stripe deeplinks", () => {
    // Read-only page per E1 spec §4.
    assert.doesNotMatch(src, /<button\b/i);
    assert.doesNotMatch(src, /<form\b/i);
    assert.doesNotMatch(src, /dashboard\.stripe\.com/);
  });

  it("has a schema_not_ready fallback so the deploy → migration window doesn't 500", () => {
    assert.match(src, /schema_not_ready|schemaMissing/i);
  });

  it("renders counters for all five reconciliation states", () => {
    // Counter render is `data-testid={`counter-${k}`}` with keys taken from
    // the STATE_LABELS record — the five keys must be present in source.
    for (const s of [
      "initiated",
      "partial",
      "fully_refunded",
      "mismatch",
      "reconciled",
    ]) {
      assert.match(
        src,
        new RegExp(`${s}:`),
        `state '${s}' should appear as a STATE_LABELS / TONE key`,
      );
    }
    // And the counter template itself.
    assert.match(src, /data-testid=\{`counter-\$\{k\}`\}/);
  });

  it("lists the last 50 mismatch rows with the required columns", () => {
    assert.match(src, /\.limit\(50\)/);
    assert.match(src, /stripe_refund_id/);
    assert.match(src, /booking_id/);
    assert.match(src, /mismatch_reason/);
    assert.match(src, /initiated_at/);
  });
});

describe("admin/finance tabs — flag-gated nav link", () => {
  const src = read(TABS_PATH);
  it("only adds the Refunds tab when NEXT_PUBLIC_ADMIN_FINANCE_V2==='true'", () => {
    assert.match(src, /NEXT_PUBLIC_ADMIN_FINANCE_V2/);
    assert.match(src, /\/admin\/finance\/refunds/);
    // The flag check should gate the push into the tabs array.
    const idx = src.indexOf("NEXT_PUBLIC_ADMIN_FINANCE_V2");
    const push = src.indexOf("/admin/finance/refunds");
    assert.ok(idx < push, "flag check must guard the tab push");
  });
});
