/**
 * Tests for canReadNote — the pure authorisation the summarise route uses.
 *
 * Mirrors the SELECT RLS on care_note_summaries: author, about_user, or a
 * party on the linked booking may read; everyone else is denied (403). The
 * key safety case is "seeker A cannot read summaries on seeker B's notes".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canReadNote } from "./authorise";

describe("canReadNote", () => {
  it("allows the note's author (the carer who wrote it)", () => {
    assert.equal(
      canReadNote({
        userId: "carer",
        authorId: "carer",
        aboutUserId: null,
        booking: null,
      }),
      true,
    );
  });

  it("allows the family member the note concerns (about_user_id)", () => {
    assert.equal(
      canReadNote({
        userId: "family",
        authorId: "carer",
        aboutUserId: "family",
        booking: null,
      }),
      true,
    );
  });

  it("allows the seeker who owns the linked booking", () => {
    assert.equal(
      canReadNote({
        userId: "seekerA",
        authorId: "carer",
        aboutUserId: null,
        booking: { seekerId: "seekerA", caregiverId: "carer" },
      }),
      true,
    );
  });

  it("allows the caregiver on the linked booking", () => {
    assert.equal(
      canReadNote({
        userId: "carer",
        authorId: "other",
        aboutUserId: null,
        booking: { seekerId: "seekerA", caregiverId: "carer" },
      }),
      true,
    );
  });

  it("denies seeker B reading a note on seeker A's booking", () => {
    assert.equal(
      canReadNote({
        userId: "seekerB",
        authorId: "carer",
        aboutUserId: null,
        booking: { seekerId: "seekerA", caregiverId: "carer" },
      }),
      false,
    );
  });

  it("denies an unrelated user when there is no booking", () => {
    assert.equal(
      canReadNote({
        userId: "stranger",
        authorId: "carer",
        aboutUserId: "family",
        booking: null,
      }),
      false,
    );
  });
});
