import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugStem, generateSlug, pickUniqueSlug, isValidSlug } from "./slug";

describe("slugStem", () => {
  it("builds first-name + last-initial", () => {
    assert.equal(slugStem("Priya Kaur"), "priya-k");
  });

  it("uses only the first name when there is no surname", () => {
    assert.equal(slugStem("Madonna"), "madonna");
  });

  it("strips punctuation and accents", () => {
    assert.equal(slugStem("Renée O'Brien"), "renee-o");
  });

  it("falls back to 'carer' when the name yields nothing", () => {
    assert.equal(slugStem("  !@#  "), "carer");
    assert.equal(slugStem(null), "carer");
  });
});

describe("generateSlug", () => {
  it("produces stem-suffix with a 4-char tail", () => {
    assert.equal(generateSlug("Priya Kaur", "7f3a"), "priya-k-7f3a");
  });

  it("is a valid slug regardless of input", () => {
    assert.ok(isValidSlug(generateSlug("Renée O'Brien")));
  });

  it("clamps over-long names to the validator limit", () => {
    const long = "Bartholomew".repeat(20) + " Wigglesworthington";
    const slug = generateSlug(long, "7f3a");
    assert.ok(slug.length <= 80);
    assert.ok(isValidSlug(slug));
  });
});

describe("pickUniqueSlug", () => {
  it("returns the first candidate when nothing is taken", () => {
    const s = pickUniqueSlug("Priya Kaur", new Set(), () => "7f3a");
    assert.equal(s, "priya-k-7f3a");
  });

  it("retries with fresh suffixes on collision", () => {
    const suffixes = ["aaaa", "bbbb", "cccc"];
    let i = 0;
    const taken = new Set(["priya-k-aaaa", "priya-k-bbbb"]);
    const s = pickUniqueSlug("Priya Kaur", taken, () => suffixes[i++]);
    assert.equal(s, "priya-k-cccc");
  });

  it("never returns a slug already in the taken set", () => {
    const taken = new Set(["sam-l-0001"]);
    const s = pickUniqueSlug("Sam Lee", taken);
    assert.ok(!taken.has(s));
    assert.ok(s.startsWith("sam-l-"));
  });
});

describe("isValidSlug", () => {
  it("accepts well-formed slugs", () => {
    assert.ok(isValidSlug("priya-k-7f3a"));
    assert.ok(isValidSlug("madonna-1a2b"));
  });

  it("rejects uppercase, spaces, and leading/trailing dashes", () => {
    assert.ok(!isValidSlug("Priya-K"));
    assert.ok(!isValidSlug("priya k"));
    assert.ok(!isValidSlug("-priya"));
    assert.ok(!isValidSlug("priya-"));
  });
});
