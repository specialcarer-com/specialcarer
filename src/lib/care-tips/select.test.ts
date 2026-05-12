import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectTips, weekKey } from "./select";
import type { CareTip } from "./types";

const TIPS: CareTip[] = [
  {
    id: "winter-elderly",
    title: "Winter elderly",
    body: "body",
    audience: "seeker",
    verticals: ["elderly_care"],
    months: [12, 1, 2],
    tags: [],
  },
  {
    id: "summer-child",
    title: "Summer child",
    body: "body",
    audience: "seeker",
    verticals: ["childcare"],
    months: [6, 7, 8],
    tags: [],
  },
  {
    id: "carer-only",
    title: "Carer only",
    body: "body",
    audience: "caregiver",
    verticals: [],
    months: [],
    tags: [],
  },
  {
    id: "year-round-both",
    title: "Year-round both",
    body: "body",
    audience: "both",
    verticals: [],
    months: [],
    tags: [],
  },
];

describe("selectTips", () => {
  it("filters out tips for the wrong audience", () => {
    const out = selectTips({
      tips: TIPS,
      audience: "seeker",
      month: 1,
      verticals: ["elderly_care"],
      seed: "seed-1",
      count: 10,
    });
    assert.ok(!out.some((t) => t.id === "carer-only"));
  });

  it("filters by month — summer-child is hidden in January", () => {
    const out = selectTips({
      tips: TIPS,
      audience: "seeker",
      month: 1,
      verticals: ["childcare"],
      seed: "seed-2",
      count: 10,
    });
    assert.ok(!out.some((t) => t.id === "summer-child"));
  });

  it("filters by vertical intersection", () => {
    const out = selectTips({
      tips: TIPS,
      audience: "seeker",
      month: 1,
      verticals: ["postnatal"],
      seed: "seed-3",
      count: 10,
    });
    // Only generic (no verticals) tips survive for postnatal in January.
    assert.deepEqual(
      out.map((t) => t.id).sort(),
      ["year-round-both"],
    );
  });

  it("is deterministic for the same seed", () => {
    const args = {
      tips: TIPS,
      audience: "seeker" as const,
      month: 1,
      verticals: ["elderly_care", "childcare"] as const,
      seed: "stable",
      count: 2,
    };
    const a = selectTips({ ...args, verticals: [...args.verticals] });
    const b = selectTips({ ...args, verticals: [...args.verticals] });
    assert.deepEqual(
      a.map((t) => t.id),
      b.map((t) => t.id),
    );
  });

  it("weekKey changes when crossing a week boundary", () => {
    const earlyJan = new Date(Date.UTC(2026, 0, 1));
    const lateJan = new Date(Date.UTC(2026, 0, 20));
    assert.notEqual(weekKey(earlyJan), weekKey(lateJan));
  });
});
