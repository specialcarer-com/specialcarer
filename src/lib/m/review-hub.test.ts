/**
 * Review hub logic tests (PR-R4): sort order, empty-state detection, and
 * review-form validation. Pure functions — no rendering required.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isHubEmpty,
  sortPendingNewestFirst,
  sortWrittenNewestFirst,
  validateReviewForm,
  REVIEW_BODY_LIMIT,
} from "./review-hub";

test("isHubEmpty is true only when there are no pending reviews", () => {
  assert.equal(isHubEmpty([]), true);
  assert.equal(isHubEmpty([{ booking_id: "a" }]), false);
});

test("sortPendingNewestFirst orders by completed_at descending", () => {
  const items = [
    { booking_id: "old", completed_at: "2026-01-01T00:00:00Z" },
    { booking_id: "new", completed_at: "2026-06-01T00:00:00Z" },
    { booking_id: "mid", completed_at: "2026-03-01T00:00:00Z" },
  ];
  const sorted = sortPendingNewestFirst(items);
  assert.deepEqual(
    sorted.map((i) => i.booking_id),
    ["new", "mid", "old"],
  );
});

test("sortPendingNewestFirst does not mutate the input", () => {
  const items = [
    { booking_id: "a", completed_at: "2026-01-01T00:00:00Z" },
    { booking_id: "b", completed_at: "2026-06-01T00:00:00Z" },
  ];
  const before = items.map((i) => i.booking_id).join(",");
  sortPendingNewestFirst(items);
  assert.equal(items.map((i) => i.booking_id).join(","), before);
});

test("sortWrittenNewestFirst orders by created_at descending", () => {
  const items = [
    { booking_id: "x", created_at: "2026-02-01T00:00:00Z" },
    { booking_id: "y", created_at: "2026-05-01T00:00:00Z" },
  ];
  const sorted = sortWrittenNewestFirst(items);
  assert.deepEqual(
    sorted.map((i) => i.booking_id),
    ["y", "x"],
  );
});

test("validateReviewForm requires an integer rating between 1 and 5", () => {
  assert.equal(validateReviewForm({ rating: 0, body: "" }), "rating");
  assert.equal(validateReviewForm({ rating: 6, body: "" }), "rating");
  assert.equal(validateReviewForm({ rating: 2.5, body: "" }), "rating");
  assert.equal(validateReviewForm({ rating: 1, body: "" }), null);
  assert.equal(validateReviewForm({ rating: 5, body: "ok" }), null);
});

test("validateReviewForm rejects a body over the limit", () => {
  const atLimit = "x".repeat(REVIEW_BODY_LIMIT);
  const overLimit = "x".repeat(REVIEW_BODY_LIMIT + 1);
  assert.equal(validateReviewForm({ rating: 4, body: atLimit }), null);
  assert.equal(validateReviewForm({ rating: 4, body: overLimit }), "body");
});

test("validateReviewForm reports the rating error before the body error", () => {
  // Both invalid → rating takes precedence (it is the required field).
  const overLimit = "x".repeat(REVIEW_BODY_LIMIT + 1);
  assert.equal(validateReviewForm({ rating: 0, body: overLimit }), "rating");
});

test("REVIEW_BODY_LIMIT is 500 per the spec", () => {
  assert.equal(REVIEW_BODY_LIMIT, 500);
});
