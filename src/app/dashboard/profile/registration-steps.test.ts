import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LANGUAGE_OPTIONS,
  splitLanguages,
  startingStep,
  STEP_TITLES,
} from "./registration-steps";

const ready = {
  hasName: true,
  hasBio: true,
  hasService: true,
  hasFormat: true,
  hasRate: true,
  hasLocation: true,
};

describe("startingStep", () => {
  it("starts new profiles at the first step", () => {
    assert.equal(
      startingStep({ ...ready, hasName: false, hasBio: false, hasService: false, hasFormat: false, hasRate: false, hasLocation: false }),
      0,
    );
  });
  it("goes to the first step with something missing", () => {
    assert.equal(startingStep({ ...ready, hasBio: false }), 0);
    assert.equal(startingStep({ ...ready, hasService: false }), 1);
    assert.equal(startingStep({ ...ready, hasFormat: false }), 1);
    assert.equal(startingStep({ ...ready, hasRate: false }), 2);
    assert.equal(startingStep({ ...ready, hasLocation: false }), 2);
  });
  it("lands on Go live once the basics are done", () => {
    assert.equal(startingStep(ready), STEP_TITLES.length - 1);
  });
});

describe("splitLanguages", () => {
  it("ticks known languages case-insensitively and keeps the rest as other", () => {
    const r = splitLanguages(["english", "Polish", "Welsh", " Cantonese "]);
    assert.deepEqual(r.known, ["English", "Polish"]);
    assert.deepEqual(r.other, ["Welsh", "Cantonese"]);
  });
  it("removes blanks and duplicates", () => {
    const r = splitLanguages(["", "English", "ENGLISH", "Welsh", "Welsh"]);
    assert.deepEqual(r.known, ["English"]);
    assert.deepEqual(r.other, ["Welsh"]);
  });
  it("offers English first", () => {
    assert.equal(LANGUAGE_OPTIONS[0], "English");
  });
});

describe("editor wiring", () => {
  const src = readFileSync(new URL("./editor.tsx", import.meta.url), "utf8");
  it("makes the weekly rate optional and hides the US country picker", () => {
    assert.match(src, /useState<number \| "">/);
    assert.match(src, /US_REGION_ENABLED \? initial\.country : "GB"/);
    assert.match(src, /US_REGION_ENABLED && \(/);
  });
  it("caps languages at the API limit with a visible message and no US placeholders", () => {
    assert.match(src, /const MAX_LANGUAGES = 8/);
    assert.match(src, /allLanguages\.length > MAX_LANGUAGES/);
    assert.doesNotMatch(src, /New York/);
  });
  it("explains the Founder Membership before the publish step fails", () => {
    assert.match(src, /Founder Membership/);
    assert.match(src, /only needed when you publish/);
  });
});
