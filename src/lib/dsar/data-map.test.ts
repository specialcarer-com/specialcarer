/**
 * DSAR data map guard.
 *
 * Fails when the written decision in data-map.ts and the real system
 * drift apart: a new table with no decision, an "exported" table the
 * exporter does not read, or a withheld table with no stated reason.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DSAR_DATA_MAP } from "./data-map";
import { EXPORTED_TABLE_NAMES } from "./export";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Tables created in migrations, in lower case without schema prefix. */
function tablesCreatedInMigrations(): Set<string> {
  const found = new Set<string>();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?/gi;
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const m of sql.matchAll(re)) found.add(m[1].toLowerCase());
  }
  // Words the pattern can catch that are not table names.
  found.delete("if");
  return found;
}

describe("DSAR data map", () => {
  it("has a decision for every table created in a migration", () => {
    const undecided = [...tablesCreatedInMigrations()]
      .filter((t) => !(t in DSAR_DATA_MAP))
      .sort();
    assert.deepEqual(
      undecided,
      [],
      "Add each table to src/lib/dsar/data-map.ts: exported, deferred, excluded or not_personal, with a reason unless exported.",
    );
  });

  it("marks exactly the tables the exporter reads as exported", () => {
    const mapped = new Set(
      Object.entries(DSAR_DATA_MAP)
        .filter(([, e]) => e.disposition === "exported")
        .map(([t]) => t),
    );
    const notMarked = [...EXPORTED_TABLE_NAMES].filter((t) => !mapped.has(t)).sort();
    const notRead = [...mapped].filter((t) => !EXPORTED_TABLE_NAMES.has(t)).sort();
    assert.deepEqual(notMarked, [], "exporter reads these but the map does not say exported");
    assert.deepEqual(notRead, [], "map says exported but the exporter does not read these");
  });

  it("gives a reason for every table that is not exported", () => {
    const missing = Object.entries(DSAR_DATA_MAP)
      .filter(([, e]) => e.disposition !== "exported")
      .filter(([, e]) => (e.reason ?? "").trim().length < 20)
      .map(([t]) => t)
      .sort();
    assert.deepEqual(missing, []);
  });
});
