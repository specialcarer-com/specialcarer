/**
 * B1 / RLS-audit-close-leaks regression guards.
 *
 * We can't spin up a live Postgres inside `node --test`, so we verify the
 * design at two layers:
 *
 *   1) The migration file itself says the right things (enables RLS,
 *      revokes the answer-key column, drops the public-read hole, adds the
 *      dates-only view).
 *   2) The application code paths that touch the sensitive columns route
 *      through the correct client / view.
 *
 * If a future change accidentally re-introduces one of the four audited
 * leaks, this file goes red before it can ship.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "./20260911220000_rls_audit_close_leaks.sql",
  import.meta.url,
);
const MOBILE_CARER_ROUTE = new URL(
  "../../src/app/api/m/carer/[id]/route.ts",
  import.meta.url,
);
const MOBILE_CARER_PAGE = new URL(
  "../../src/app/m/carer/[id]/page.tsx",
  import.meta.url,
);
const QUIZ_SUBMIT_ROUTE = new URL(
  "../../src/app/api/training/[slug]/quiz/submit/route.ts",
  import.meta.url,
);
const MOBILE_QUIZ_PAGE = new URL(
  "../../src/app/m/training/[slug]/quiz/page.tsx",
  import.meta.url,
);

function readFile(url: URL): string {
  return readFileSync(url, "utf8");
}

function stripSqlComments(src: string): string {
  return src.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripTsComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("B1 migration — interviews / interview_rooms", () => {
  const sql = stripSqlComments(readFile(MIGRATION_PATH));

  it("enables row level security on interviews", () => {
    assert.match(
      sql,
      /alter\s+table\s+public\.interviews\s+enable\s+row\s+level\s+security/i,
    );
  });

  it("enables row level security on interview_rooms", () => {
    assert.match(
      sql,
      /alter\s+table\s+public\.interview_rooms\s+enable\s+row\s+level\s+security/i,
    );
  });

  it("gives interviews a participant-only read policy", () => {
    assert.match(sql, /interviews_participant_read/);
    // Both participant identities must be in the USING clause.
    assert.match(sql, /carer_id\s*=\s*\(\s*select\s+auth\.uid\(\)/i);
    assert.match(sql, /family_id\s*=\s*\(\s*select\s+auth\.uid\(\)/i);
  });

  it("does NOT add any client-facing select policy on interview_rooms", () => {
    // Deny-by-default under RLS. If someone reintroduces a policy, catch it.
    assert.equal(
      /create\s+policy[^;]*on\s+public\.interview_rooms[^;]*for\s+select/i.test(
        sql,
      ),
      false,
      "interview_rooms must stay server-only (no client select policy)",
    );
  });
});

describe("B1 migration — training_quiz_questions answer key", () => {
  const sql = stripSqlComments(readFile(MIGRATION_PATH));

  it("revokes the correct_index column from anon and authenticated", () => {
    assert.match(
      sql,
      /revoke\s+select\s*\(\s*correct_index\s*\)\s+on\s+public\.training_quiz_questions\s+from\s+anon/i,
    );
    assert.match(
      sql,
      /revoke\s+select\s*\(\s*correct_index\s*\)\s+on\s+public\.training_quiz_questions\s+from\s+authenticated/i,
    );
  });

  it("re-grants the safe columns so the quiz page still renders", () => {
    assert.match(sql, /grant\s+select\s*\([^)]*prompt[^)]*options[^)]*\)/i);
  });
});

describe("B1 migration — caregiver_blockouts", () => {
  const sql = stripSqlComments(readFile(MIGRATION_PATH));

  it("drops the public-read hole", () => {
    assert.match(
      sql,
      /drop\s+policy\s+blockouts_public_read\s+on\s+public\.caregiver_blockouts/i,
    );
  });

  it("replaces it with an owner-only read policy", () => {
    assert.match(sql, /blockouts_self_read/);
    assert.match(sql, /user_id\s*=\s*\(\s*select\s+auth\.uid\(\)/i);
  });

  it("creates the dates-only public view", () => {
    assert.match(
      sql,
      /create\s+(or\s+replace\s+)?view\s+public\.caregiver_blockouts_public/i,
    );
  });

  it("does not expose reason via the public view", () => {
    // Grab the view definition and scan it.
    const match = sql.match(
      /create\s+(?:or\s+replace\s+)?view\s+public\.caregiver_blockouts_public\s+as([\s\S]*?);/i,
    );
    assert.ok(match, "view definition not found");
    const body = (match![1] ?? "").toLowerCase();
    assert.equal(
      /\breason\b/.test(body),
      false,
      "caregiver_blockouts_public must not expose reason",
    );
  });

  it("grants the view to authenticated but not to anon", () => {
    assert.match(
      sql,
      /grant\s+select\s+on\s+public\.caregiver_blockouts_public\s+to\s+authenticated/i,
    );
    // Anon must not appear on a grant line for the view.
    const anonGrant =
      /grant\s+[^;]*on\s+public\.caregiver_blockouts_public[^;]*to\s+[^;]*\banon\b/i.test(
        sql,
      );
    assert.equal(anonGrant, false, "the view must not be readable by anon");
  });
});

describe("B1 migration — course_population_requirements", () => {
  const sql = stripSqlComments(readFile(MIGRATION_PATH));

  it("enables row level security", () => {
    assert.match(
      sql,
      /alter\s+table\s+public\.course_population_requirements\s+enable\s+row\s+level\s+security/i,
    );
  });

  it("adds a read policy so authenticated clients can still see the gates", () => {
    assert.match(sql, /course_population_requirements_authenticated_read/);
  });
});

describe("B1 app wiring — mobile carer profile no longer leaks reason", () => {
  const routeSrc = readFile(MOBILE_CARER_ROUTE);
  const routeCode = stripTsComments(routeSrc);

  it("reads from the dates-only public view, not the base table", () => {
    assert.match(routeCode, /from\(["']caregiver_blockouts_public["']\)/);
    // The base-table read must be gone from this route.
    assert.equal(
      /from\(["']caregiver_blockouts["']\)/.test(routeCode),
      false,
      "mobile carer profile must not read the base caregiver_blockouts table",
    );
  });

  it("does not select or return the free-text reason column", () => {
    assert.equal(
      /\breason\b/.test(routeCode),
      false,
      "reason column must not appear in the mobile carer profile route",
    );
  });

  it("removes reason from the client-facing ApiCarerBlockout type", () => {
    assert.equal(
      /ApiCarerBlockout[\s\S]{0,200}reason/i.test(routeSrc),
      false,
      "ApiCarerBlockout must not carry a reason field",
    );
  });

  it("consumer page stops rendering the reason chip", () => {
    const pageCode = stripTsComments(readFile(MOBILE_CARER_PAGE));
    assert.equal(
      /b\.reason/.test(pageCode),
      false,
      "carer profile page must not render b.reason",
    );
  });
});

describe("B1 app wiring — quiz submit reads correct_index via admin", () => {
  const src = readFile(QUIZ_SUBMIT_ROUTE);
  const code = stripTsComments(src);

  it("imports the admin client", () => {
    assert.match(src, /createAdminClient/);
  });

  it("routes the correct_index read through the admin client", () => {
    // Grab the block from the questions .from(...) up to the next terminator.
    const idx = code.indexOf('from("training_quiz_questions")');
    assert.ok(idx > -1, "training_quiz_questions read not found");
    // The 300 chars before that .from(...) should contain a createAdminClient call
    // rather than a bare user-scope supabase client.
    const window = code.slice(Math.max(0, idx - 300), idx);
    assert.match(
      window,
      /createAdminClient\(\)/,
      "questions read must be preceded by createAdminClient() call",
    );
    // And the actual .from call must be chained off `admin`, not `supabase`.
    const after = code.slice(idx - 20, idx + 60);
    assert.match(
      after,
      /admin\s*\.\s*from\("training_quiz_questions"\)/,
      "questions read must be chained off the admin client",
    );
  });
});

describe("B1 regression guard — no client path selects correct_index", () => {
  it("mobile quiz page never asks for correct_index", () => {
    const src = readFile(MOBILE_QUIZ_PAGE);
    const idx = src.indexOf('from("training_quiz_questions")');
    assert.ok(idx > -1, "quiz page must still read the questions table");
    // Look at the select() call that follows.
    const chunk = src.slice(idx, idx + 400);
    assert.equal(
      /correct_index/.test(chunk),
      false,
      "mobile quiz page must not request correct_index",
    );
  });
});
