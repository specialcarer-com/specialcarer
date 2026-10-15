import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  audienceForRole,
  canCreateFamilyBooking,
  roleForNewAccount,
  sideMismatch,
} from "./account-side";

describe("audienceForRole / roleForNewAccount", () => {
  it("maps roles to audiences", () => {
    assert.equal(audienceForRole("caregiver"), "caregiver");
    assert.equal(audienceForRole("seeker"), "family");
    assert.equal(audienceForRole("organization"), "organisation");
    assert.equal(audienceForRole("admin"), null);
    assert.equal(audienceForRole(null), null);
  });
  it("only stamps carer or family on new accounts", () => {
    assert.equal(roleForNewAccount("caregiver"), "caregiver");
    assert.equal(roleForNewAccount("family"), "seeker");
    assert.equal(roleForNewAccount("organisation"), null);
  });
});

describe("sideMismatch", () => {
  it("blocks a finished carer account used on the family page", () => {
    const m = sideMismatch({ role: "caregiver", profileComplete: true, audience: "family" });
    assert.ok(m);
    assert.equal(m.actual, "caregiver");
    assert.equal(m.signInHref, "/login/caregiver");
    assert.match(m.message, /carer account/);
    assert.match(m.message, /family account/);
  });
  it("blocks a finished family account used on the carer page", () => {
    const m = sideMismatch({ role: "seeker", profileComplete: true, audience: "caregiver" });
    assert.equal(m?.signInHref, "/login/family");
  });
  it("allows the matching side", () => {
    assert.equal(sideMismatch({ role: "caregiver", profileComplete: true, audience: "caregiver" }), null);
    assert.equal(sideMismatch({ role: "seeker", profileComplete: true, audience: "family" }), null);
  });
  it("never blocks an unfinished profile (still choosing a side)", () => {
    assert.equal(sideMismatch({ role: "seeker", profileComplete: false, audience: "caregiver" }), null);
  });
  it("never blocks admins or unknown roles", () => {
    assert.equal(sideMismatch({ role: "admin", profileComplete: true, audience: "family" }), null);
    assert.equal(sideMismatch({ role: undefined, profileComplete: true, audience: "family" }), null);
  });
});

describe("canCreateFamilyBooking", () => {
  it("refuses carers only", () => {
    assert.equal(canCreateFamilyBooking("caregiver"), false);
    assert.equal(canCreateFamilyBooking("seeker"), true);
    assert.equal(canCreateFamilyBooking("organization"), true);
    assert.equal(canCreateFamilyBooking("admin"), true);
    assert.equal(canCreateFamilyBooking(null), true);
  });
});

describe("wiring: the app actually uses the side checks", () => {
  const read = (rel: string) =>
    readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

  it("the booking route refuses carer accounts before doing any work", () => {
    const route = read("app/api/stripe/create-booking-intent/route.ts");
    assert.match(route, /canCreateFamilyBooking\(bookerProfile\?\.role\)/);
    assert.ok(
      route.indexOf("canCreateFamilyBooking(") < route.indexOf("createAdminClient()"),
      "role check must come before the admin client is used",
    );
    assert.match(route, /status: 403/);
  });

  it("the audience sign-in pages pass their audience to the login form", () => {
    const layout = read("app/login/audience-sign-in.tsx");
    assert.match(layout, /<LoginForm redirectTo=\{redirectTo\} audience=\{audience\}/);
    assert.match(layout, /export default async function AudienceSignIn\(\{\s+audience,/);
  });

  it("sign-in and sign-up both stop on a wrong-side account and sign out", () => {
    for (const rel of ["app/login/login-form.tsx", "app/signup/signup-form.tsx"]) {
      const src = read(rel);
      assert.match(src, /sideMismatch\(/, rel);
      assert.match(src, /auth\.signOut\(\)/, rel);
    }
  });
});
