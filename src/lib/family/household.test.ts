/**
 * Tests for the household-membership helpers (gap 31).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isInSameHousehold,
  listHouseholdAdults,
  type HouseholdClient,
} from "@/lib/family/household";

const SEEKER = "seeker-1";
const MEMBER = "member-1";
const OUTSIDER = "outsider-1";
const FAMILY = "family-1";

function client(overrides?: Partial<HouseholdClient>): HouseholdClient {
  return {
    async getOwnFamilyId() {
      return { familyId: FAMILY, error: null };
    },
    async listActiveMembers() {
      return {
        members: [{ user_id: MEMBER, display_name: "Adult Child" }],
        error: null,
      };
    },
    async getUserName(uid) {
      return uid === SEEKER ? "The Seeker" : null;
    },
    ...overrides,
  };
}

describe("listHouseholdAdults", () => {
  it("includes the seeker first then active members, de-duplicated", async () => {
    const { members, error } = await listHouseholdAdults(SEEKER, client());
    assert.equal(error, null);
    assert.deepEqual(
      members.map((m) => m.user_id),
      [SEEKER, MEMBER],
    );
    assert.equal(members[0].display_name, "The Seeker");
  });

  it("returns just the seeker when they own no family", async () => {
    const { members } = await listHouseholdAdults(
      SEEKER,
      client({
        async getOwnFamilyId() {
          return { familyId: null, error: null };
        },
      }),
    );
    assert.deepEqual(
      members.map((m) => m.user_id),
      [SEEKER],
    );
  });

  it("does not duplicate the seeker if they also appear as a member", async () => {
    const { members } = await listHouseholdAdults(
      SEEKER,
      client({
        async listActiveMembers() {
          return {
            members: [
              { user_id: SEEKER, display_name: "Primary" },
              { user_id: MEMBER, display_name: "Adult Child" },
            ],
            error: null,
          };
        },
      }),
    );
    assert.deepEqual(
      members.map((m) => m.user_id),
      [SEEKER, MEMBER],
    );
  });

  it("propagates a family lookup error", async () => {
    const { error } = await listHouseholdAdults(
      SEEKER,
      client({
        async getOwnFamilyId() {
          return { familyId: null, error: { message: "boom" } };
        },
      }),
    );
    assert.deepEqual(error, { message: "boom" });
  });
});

describe("isInSameHousehold", () => {
  it("treats the seeker as their own household member", async () => {
    const { ok } = await isInSameHousehold(SEEKER, SEEKER, client());
    assert.equal(ok, true);
  });

  it("accepts an active family member", async () => {
    const { ok } = await isInSameHousehold(SEEKER, MEMBER, client());
    assert.equal(ok, true);
  });

  it("rejects a user outside the household", async () => {
    const { ok } = await isInSameHousehold(SEEKER, OUTSIDER, client());
    assert.equal(ok, false);
  });
});
