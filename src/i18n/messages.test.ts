/**
 * Message-tree tests (gap 43 V1A).
 *
 *   - deepMerge layers a locale on top of en-GB so a missing key falls back to
 *     English instead of rendering the raw key path.
 *   - the three shipped message files share an identical key shape (so nothing
 *     silently 404s a string).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deepMerge, type MessageTree } from "./messages";
import enGB from "../../messages/en-GB.json";
import es from "../../messages/es.json";
import ur from "../../messages/ur.json";

function keyPaths(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === "object" && v ? keyPaths(v, path) : [path];
  });
}

test("deepMerge falls back to en-GB for a key missing in the override", () => {
  const partialEs: MessageTree = {
    common: { findCare: "Buscar cuidado" },
    // footer.emergency intentionally absent
  };
  const merged = deepMerge(enGB as MessageTree, partialEs);
  const common = merged.common as MessageTree;
  const footer = merged.footer as MessageTree;

  assert.equal(common.findCare, "Buscar cuidado"); // override wins
  assert.equal(common.dashboard, "Dashboard"); // fallback to en-GB
  assert.equal(
    footer.emergency,
    (enGB as MessageTree).footer
      ? ((enGB.footer as Record<string, string>).emergency)
      : undefined,
  ); // whole namespace falls back
});

test("es and ur ship the same keys as the en-GB source", () => {
  const base = keyPaths(enGB as MessageTree).sort();
  assert.deepEqual(keyPaths(es as MessageTree).sort(), base);
  assert.deepEqual(keyPaths(ur as MessageTree).sort(), base);
});
