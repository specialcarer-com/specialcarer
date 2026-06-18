/**
 * Bottom-nav tab-set tests (PR-R4).
 *
 * The redesign flag switches the seeker tabs between:
 *   off → Home / Bookings / Post Job / Chat / Profile
 *   on  → Home / Bookings / Chat / Review / Profile
 *
 * The selection lives in the pure `seekerNavTabs(redesign)` / `carerNavTabs()`
 * helpers so it can be asserted directly without rendering or fighting the
 * module-load flag cache. A render smoke test confirms <BottomNav> wires the
 * helper output (labels + hrefs) into the DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BottomNav,
  seekerNavTabs,
  carerNavTabs,
} from "./ui";

test("flag ON seeker tabs: Home / Bookings / Chat / Review / Profile", () => {
  const tabs = seekerNavTabs(true);
  assert.deepEqual(
    tabs.map((t) => t.key),
    ["home", "bookings", "chat", "review", "profile"],
  );
  const review = tabs.find((t) => t.key === "review");
  assert.equal(review?.href, "/m/review");
  assert.equal(review?.label, "Review");
  assert.ok(!tabs.some((t) => t.key === "jobs"), "Post Job tab removed");
});

test("flag OFF seeker tabs: Home / Bookings / Post Job / Chat / Profile", () => {
  const tabs = seekerNavTabs(false);
  assert.deepEqual(
    tabs.map((t) => t.key),
    ["home", "bookings", "jobs", "chat", "profile"],
  );
  const postJob = tabs.find((t) => t.key === "jobs");
  assert.equal(postJob?.href, "/m/post-job");
  assert.equal(postJob?.label, "Post Job");
  assert.ok(!tabs.some((t) => t.key === "review"), "Review tab absent");
});

test("both seeker tab sets have exactly 5 tabs", () => {
  assert.equal(seekerNavTabs(true).length, 5);
  assert.equal(seekerNavTabs(false).length, 5);
});

test("carer tabs are unchanged by the redesign (Home / Jobs / Chat / Profile)", () => {
  assert.deepEqual(
    carerNavTabs().map((t) => t.key),
    ["home", "jobs", "chat", "profile"],
  );
  assert.ok(!carerNavTabs().some((t) => t.key === "review"));
});

test("render smoke test: <BottomNav> emits the seeker tab labels and hrefs", () => {
  // role passed explicitly so the Supabase auto-detect effect (inert in SSR)
  // is irrelevant; reflects whatever the module-load flag value is.
  const html = renderToStaticMarkup(
    h(BottomNav, { active: "bookings", role: "seeker" as const }),
  );
  assert.match(html, />Home</);
  assert.match(html, />Bookings</);
  assert.match(html, />Profile</);
  assert.match(html, /href="\/m\/home"/);
  assert.match(html, /href="\/m\/bookings"/);
});
