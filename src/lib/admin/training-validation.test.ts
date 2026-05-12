import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateCourseCreate,
  validateCoursePatch,
  validateQuestionSet,
} from "./training-validation";

describe("validateCourseCreate", () => {
  const good = {
    slug: "infection_control",
    title: "Infection Control Basics",
    summary: "Hand hygiene and PPE.",
    category: "clinical",
    is_required: true,
    ceu_credits: 1.5,
    duration_minutes: 30,
    country_scope: "both",
    required_for_verticals: ["elderly_care", "complex_care"],
    sort_order: 50,
  };

  it("accepts a well-formed payload", () => {
    const r = validateCourseCreate(good);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.slug, "infection_control");
      assert.equal(r.value.category, "clinical");
      assert.equal(r.value.video_provider, "embed");
      assert.deepEqual(r.value.required_for_verticals, [
        "elderly_care",
        "complex_care",
      ]);
    }
  });

  it("rejects an invalid slug", () => {
    const r = validateCourseCreate({ ...good, slug: "Bad Slug!" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /slug/);
  });

  it("rejects an unknown vertical", () => {
    const r = validateCourseCreate({
      ...good,
      required_for_verticals: ["elderly_care", "intergalactic"],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /verticals/);
  });

  it("rejects ceu_credits <= 0", () => {
    const r = validateCourseCreate({ ...good, ceu_credits: 0 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /ceu_credits/);
  });

  it("rejects bad country_scope", () => {
    const r = validateCourseCreate({ ...good, country_scope: "EU" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /country_scope/);
  });

  it("rejects bad category", () => {
    const r = validateCourseCreate({ ...good, category: "marketing" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /category/);
  });

  it("dedupes verticals", () => {
    const r = validateCourseCreate({
      ...good,
      required_for_verticals: ["elderly_care", "elderly_care"],
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.value.required_for_verticals, ["elderly_care"]);
    }
  });
});

describe("validateCoursePatch", () => {
  it("accepts an empty patch", () => {
    const r = validateCoursePatch({});
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value, {});
  });

  it("accepts a partial title-only patch", () => {
    const r = validateCoursePatch({ title: "Renamed" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.title, "Renamed");
  });

  it("rejects empty title", () => {
    const r = validateCoursePatch({ title: "   " });
    assert.equal(r.ok, false);
  });
});

describe("validateQuestionSet", () => {
  const goodQuestion = {
    prompt: "What is 2+2?",
    options: ["3", "4", "5", "6"],
    correct_index: 1,
    explanation: "Basic arithmetic.",
    sort_order: 1,
  };

  it("accepts a well-formed list of one", () => {
    const r = validateQuestionSet([goodQuestion]);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.length, 1);
      assert.equal(r.value[0].correct_index, 1);
      assert.deepEqual(r.value[0].options, ["3", "4", "5", "6"]);
    }
  });

  it("rejects 3 options", () => {
    const r = validateQuestionSet([
      { ...goodQuestion, options: ["a", "b", "c"] },
    ]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /4 strings/);
  });

  it("rejects 5 options", () => {
    const r = validateQuestionSet([
      { ...goodQuestion, options: ["a", "b", "c", "d", "e"] },
    ]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /4 strings/);
  });

  it("rejects correct_index out of range", () => {
    const r = validateQuestionSet([{ ...goodQuestion, correct_index: 4 }]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /correct_index/);
  });

  it("rejects empty option", () => {
    const r = validateQuestionSet([
      { ...goodQuestion, options: ["a", "b", "", "d"] },
    ]);
    assert.equal(r.ok, false);
  });

  it("rejects non-array", () => {
    const r = validateQuestionSet("not array" as unknown);
    assert.equal(r.ok, false);
  });

  it("defaults sort_order to position", () => {
    const without = { ...goodQuestion } as Record<string, unknown>;
    delete without.sort_order;
    const r = validateQuestionSet([without, without]);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value[0].sort_order, 1);
      assert.equal(r.value[1].sort_order, 2);
    }
  });
});
