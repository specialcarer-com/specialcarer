/**
 * Tests for src/lib/candour/regulator-templates.ts.
 *
 * These are compile-and-string-shape tests only — no I/O.
 * Coverage:
 *   - Every CQC template renders and contains all required tokens.
 *   - Statutory clause references Reg 16 for `death`, Reg 18 for the
 *     other six notifiable types.
 *   - Placeholder regulators emit the "not currently applicable" note.
 *   - Each template body is at least 200 characters (defensive against
 *     accidental truncation).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CQC_TEMPLATES,
  PLACEHOLDER_REGULATORS,
  REQUIRED_TEMPLATE_TOKENS,
  type PlaceholderRegulatorKey,
} from "./regulator-templates";
import type { NotifiableType } from "./case";

const ALL_TYPES: readonly NotifiableType[] = [
  "death",
  "injury_serious",
  "abuse_alleged",
  "deprivation_of_liberty",
  "incident_police_involved",
  "service_stopped",
  "other",
];

describe("CQC_TEMPLATES", () => {
  it("has an entry for every NotifiableType", () => {
    for (const t of ALL_TYPES) {
      assert.ok(CQC_TEMPLATES[t], `missing template for type=${t}`);
      assert.ok(
        typeof CQC_TEMPLATES[t].title === "string" &&
          CQC_TEMPLATES[t].title.length > 0,
        `empty title for type=${t}`,
      );
      assert.ok(
        typeof CQC_TEMPLATES[t].body === "string" &&
          CQC_TEMPLATES[t].body.length >= 200,
        `body too short for type=${t}`,
      );
      assert.ok(
        typeof CQC_TEMPLATES[t].statutoryClause === "string" &&
          CQC_TEMPLATES[t].statutoryClause.length > 0,
        `empty statutoryClause for type=${t}`,
      );
    }
  });

  it("contains every required [PLACEHOLDER] token in every body", () => {
    for (const t of ALL_TYPES) {
      const body = CQC_TEMPLATES[t].body;
      for (const token of REQUIRED_TEMPLATE_TOKENS) {
        assert.ok(
          body.includes(token),
          `type=${t} body missing token ${token}`,
        );
      }
    }
  });

  it("references Reg 16 for death, Reg 18 for the other six", () => {
    assert.match(CQC_TEMPLATES.death.statutoryClause, /Reg 16/);
    for (const t of ALL_TYPES) {
      if (t === "death") continue;
      assert.match(
        CQC_TEMPLATES[t].statutoryClause,
        /Reg 18/,
        `type=${t} statutoryClause should reference Reg 18`,
      );
    }
  });

  it("body opens with the 'Notification to the Care Quality Commission' boilerplate", () => {
    for (const t of ALL_TYPES) {
      assert.ok(
        CQC_TEMPLATES[t].body.startsWith(
          "Notification to the Care Quality Commission under Regulation ",
        ),
        `type=${t} body missing standard opening`,
      );
    }
  });

  it("body closes with the 'without delay' affirmation sentence", () => {
    for (const t of ALL_TYPES) {
      assert.match(
        CQC_TEMPLATES[t].body,
        /This notification is being made without delay upon becoming aware of the incident on \[DISCOVERED_AT\]\./,
        `type=${t} body missing without-delay affirmation`,
      );
    }
  });

  it("body includes provider footer (Special Carer / All Care 4 U Group Ltd)", () => {
    for (const t of ALL_TYPES) {
      assert.match(
        CQC_TEMPLATES[t].body,
        /Special Carer \(All Care 4 U Group Ltd\)/,
        `type=${t} body missing provider footer`,
      );
    }
  });
});

describe("PLACEHOLDER_REGULATORS", () => {
  const keys: readonly PlaceholderRegulatorKey[] = [
    "CIW",
    "RQIA",
    "Care_Inspectorate",
  ];

  it("has exactly the three devolved-nation entries", () => {
    for (const k of keys) {
      assert.ok(PLACEHOLDER_REGULATORS[k], `missing regulator ${k}`);
    }
  });

  it("every entry emits the 'not currently applicable' note", () => {
    for (const k of keys) {
      assert.match(
        PLACEHOLDER_REGULATORS[k].note,
        /Not currently applicable/,
        `${k} missing 'not applicable' note`,
      );
      assert.match(
        PLACEHOLDER_REGULATORS[k].note,
        /England only/,
        `${k} note should mention England-only scope`,
      );
    }
  });

  it("every entry has a non-empty jurisdiction and name", () => {
    for (const k of keys) {
      assert.ok(PLACEHOLDER_REGULATORS[k].name.length > 0);
      assert.ok(PLACEHOLDER_REGULATORS[k].jurisdiction.length > 0);
    }
  });
});
