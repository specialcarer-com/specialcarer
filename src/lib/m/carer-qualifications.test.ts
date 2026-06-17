/**
 * Tests for the PR-R2 carer-qualifications helpers.
 *
 * Drives the pure *With(...) functions with a stubbed Supabase client to avoid
 * pulling in next/headers + cookies (matches the pattern in
 * src/app/api/m/carers/recent/route.test.ts). Covers both the flag-on
 * structured path and the flag-off legacy heuristic fallback.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCarerQualificationsWith,
  getCarerVerifiedStatusWith,
  inferQualificationKind,
  qualificationChipLabel,
  type QualificationsClient,
  type Qualification,
} from "@/lib/m/carer-qualifications";

const CARER = "aaaaaaaa-0000-0000-0000-000000000001";

type QualRow = {
  id: string;
  kind: Qualification["kind"];
  label: string | null;
  awarding_body: string | null;
  awarded_on: string | null;
  verified_at: string | null;
};

type ProfileRow = {
  verified_status: string | null;
  verified_at: string | null;
  certifications: string[] | null;
};

type BgRow = { status: string | null };

function makeClient(opts: {
  qualRows?: QualRow[];
  qualError?: { message: string } | null;
  profile?: ProfileRow | null;
  profileError?: { message: string } | null;
  bgRows?: BgRow[];
  bgError?: { message: string } | null;
}): QualificationsClient {
  return {
    from(table: string) {
      if (table === "carer_qualifications") {
        return {
          select() {
            return {
              eq() {
                return {
                  not() {
                    return {
                      async order() {
                        return {
                          data: opts.qualError ? null : (opts.qualRows ?? []),
                          error: opts.qualError ?? null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "caregiver_profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: opts.profileError
                        ? null
                        : (opts.profile ?? null),
                      error: opts.profileError ?? null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      // background_checks
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async limit() {
                      return {
                        data: opts.bgError ? null : (opts.bgRows ?? []),
                        error: opts.bgError ?? null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as QualificationsClient;
}

describe("inferQualificationKind", () => {
  it("maps NVQ levels", () => {
    assert.equal(inferQualificationKind("NVQ Level 2"), "NVQ_L2");
    assert.equal(inferQualificationKind("nvq 3 health"), "NVQ_L3");
    assert.equal(inferQualificationKind("NVQ4"), "NVQ_L4");
    assert.equal(inferQualificationKind("NVQ Level 5 leadership"), "NVQ_L5");
  });

  it("maps nursing registrations and care certificate", () => {
    assert.equal(inferQualificationKind("RMN"), "RMN");
    assert.equal(inferQualificationKind("Registered RGN"), "RGN");
    assert.equal(inferQualificationKind("The Care Certificate"), "CARE_CERT");
    assert.equal(
      inferQualificationKind("Diploma in Health and Social Care"),
      "DIPLOMA_HEALTH_SOCIAL_CARE",
    );
  });

  it("falls back to OTHER", () => {
    assert.equal(inferQualificationKind("First Aid"), "OTHER");
  });
});

describe("qualificationChipLabel", () => {
  it("uses canonical labels for known kinds", () => {
    assert.equal(
      qualificationChipLabel({
        id: "1",
        kind: "NVQ_L3",
        label: "whatever",
        awardingBody: null,
        awardedOn: null,
        verifiedAt: null,
      }),
      "NVQ L3",
    );
  });

  it("uses the free-text label for OTHER", () => {
    assert.equal(
      qualificationChipLabel({
        id: "1",
        kind: "OTHER",
        label: "Dementia Care",
        awardingBody: null,
        awardedOn: null,
        verifiedAt: null,
      }),
      "Dementia Care",
    );
  });
});

describe("getCarerQualificationsWith — flag ON", () => {
  it("returns mapped verified rows", async () => {
    const client = makeClient({
      qualRows: [
        {
          id: "q1",
          kind: "NVQ_L3",
          label: "NVQ Level 3 H&SC",
          awarding_body: "City & Guilds",
          awarded_on: "2022-06-01",
          verified_at: "2023-01-01T00:00:00Z",
        },
      ],
    });
    const out = await getCarerQualificationsWith(client, CARER, true);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], {
      id: "q1",
      kind: "NVQ_L3",
      label: "NVQ Level 3 H&SC",
      awardingBody: "City & Guilds",
      awardedOn: "2022-06-01",
      verifiedAt: "2023-01-01T00:00:00Z",
    });
  });

  it("returns [] when there are no rows", async () => {
    const client = makeClient({ qualRows: [] });
    const out = await getCarerQualificationsWith(client, CARER, true);
    assert.deepEqual(out, []);
  });

  it("throws on db error", async () => {
    const client = makeClient({ qualError: { message: "boom" } });
    await assert.rejects(
      () => getCarerQualificationsWith(client, CARER, true),
      /boom/,
    );
  });
});

describe("getCarerQualificationsWith — flag OFF (legacy fallback)", () => {
  it("derives qualifications from certifications text[]", async () => {
    const client = makeClient({
      profile: {
        verified_status: null,
        verified_at: null,
        certifications: ["NVQ Level 3", "First Aid", "  "],
      },
    });
    const out = await getCarerQualificationsWith(client, CARER, false);
    // blank entry filtered out
    assert.equal(out.length, 2);
    assert.equal(out[0].kind, "NVQ_L3");
    assert.equal(out[0].label, "NVQ Level 3");
    assert.equal(out[0].verifiedAt, null);
    assert.equal(out[1].kind, "OTHER");
  });

  it("returns [] when the profile has no certifications", async () => {
    const client = makeClient({
      profile: { verified_status: null, verified_at: null, certifications: null },
    });
    const out = await getCarerQualificationsWith(client, CARER, false);
    assert.deepEqual(out, []);
  });
});

describe("getCarerVerifiedStatusWith — flag ON", () => {
  it("returns verified + date when status is verified", async () => {
    const client = makeClient({
      profile: {
        verified_status: "verified",
        verified_at: "2024-02-03T10:00:00Z",
        certifications: null,
      },
    });
    const out = await getCarerVerifiedStatusWith(client, CARER, true);
    assert.equal(out.status, "verified");
    assert.ok(out.at instanceof Date);
    assert.equal(out.at?.toISOString(), "2024-02-03T10:00:00.000Z");
  });

  it("coerces unknown status to pending and nulls the date", async () => {
    const client = makeClient({
      profile: {
        verified_status: "weird",
        verified_at: "2024-02-03T10:00:00Z",
        certifications: null,
      },
    });
    const out = await getCarerVerifiedStatusWith(client, CARER, true);
    assert.equal(out.status, "pending");
    assert.equal(out.at, null);
  });

  it("rejected has no date", async () => {
    const client = makeClient({
      profile: {
        verified_status: "rejected",
        verified_at: "2024-02-03T10:00:00Z",
        certifications: null,
      },
    });
    const out = await getCarerVerifiedStatusWith(client, CARER, true);
    assert.equal(out.status, "rejected");
    assert.equal(out.at, null);
  });

  it("missing profile → pending", async () => {
    const client = makeClient({ profile: null });
    const out = await getCarerVerifiedStatusWith(client, CARER, true);
    assert.equal(out.status, "pending");
    assert.equal(out.at, null);
  });
});

describe("getCarerVerifiedStatusWith — flag OFF (legacy fallback)", () => {
  it("verified when an approved background check exists", async () => {
    const client = makeClient({ bgRows: [{ status: "approved" }] });
    const out = await getCarerVerifiedStatusWith(client, CARER, false);
    assert.equal(out.status, "verified");
    assert.equal(out.at, null);
  });

  it("pending when no approved background check", async () => {
    const client = makeClient({ bgRows: [] });
    const out = await getCarerVerifiedStatusWith(client, CARER, false);
    assert.equal(out.status, "pending");
  });

  it("throws on db error", async () => {
    const client = makeClient({ bgError: { message: "down" } });
    await assert.rejects(
      () => getCarerVerifiedStatusWith(client, CARER, false),
      /down/,
    );
  });
});
