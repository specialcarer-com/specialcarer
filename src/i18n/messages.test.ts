/**
 * Message-tree tests (gap 43 V1A).
 *
 *   - deepMerge layers a locale on top of en-GB so a missing key falls back to
 *     English instead of rendering the raw key path.
 *   - every shipped message file shares an identical key shape (so nothing
 *     silently 404s a string).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deepMerge, type MessageTree } from "./messages";
import enGB from "../../messages/en-GB.json";
import enUS from "../../messages/en-US.json";
import es from "../../messages/es.json";
import pl from "../../messages/pl.json";
import ur from "../../messages/ur.json";
import ro from "../../messages/ro.json";
import bn from "../../messages/bn.json";
import de from "../../messages/de.json";
import fr from "../../messages/fr.json";

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
  assert.equal(footer.emergency, enGB.footer.emergency); // whole namespace falls back
});

test("every shipped locale ships the same keys as the en-GB source", () => {
  const base = keyPaths(enGB as MessageTree).sort();
  const locales: Record<string, MessageTree> = {
    "en-US": enUS as MessageTree,
    es: es as MessageTree,
    pl: pl as MessageTree,
    ur: ur as MessageTree,
    ro: ro as MessageTree,
    bn: bn as MessageTree,
    de: de as MessageTree,
    fr: fr as MessageTree,
  };
  for (const [code, tree] of Object.entries(locales)) {
    assert.deepEqual(keyPaths(tree).sort(), base, `${code} key shape`);
  }
});
