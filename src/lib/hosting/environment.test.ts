import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { deploymentEnvironment, isProductionDeployment } from "./environment";

test("Vercel production and explicit preview retain their different guards", () => {
  assert.equal(isProductionDeployment({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionDeployment({ VERCEL_ENV: "preview", NODE_ENV: "production" }), false);
  assert.equal(deploymentEnvironment({ VERCEL_ENV: "development" }), "development");
});

test("provider-neutral explicit deployment environment overrides build mode and Vercel fallback", () => {
  assert.equal(isProductionDeployment({ APP_ENV: "production" }), true);
  assert.equal(deploymentEnvironment({ APP_ENV: "preview", NODE_ENV: "production" }), "preview");
  assert.equal(deploymentEnvironment({ APP_ENV: "development", NODE_ENV: "production" }), "development");
  assert.equal(isProductionDeployment({ APP_ENV: "production", VERCEL_ENV: "preview" }), true);
});

test("missing or invalid deployed configuration fails closed; local dev/tests remain usable", () => {
  assert.equal(isProductionDeployment({}), true);
  assert.equal(isProductionDeployment({ NODE_ENV: "production" }), true);
  assert.equal(isProductionDeployment({ APP_ENV: "staging", VERCEL_ENV: "preview" }), true);
  assert.equal(isProductionDeployment({ APP_ENV: " production " }), true);
  assert.equal(isProductionDeployment({ VERCEL_ENV: "unknown" }), true);
  assert.equal(isProductionDeployment({ NODE_ENV: "development" }), false);
  assert.equal(isProductionDeployment({ NODE_ENV: "test" }), false);
  assert.equal(isProductionDeployment({ APP_ENV: "", VERCEL_ENV: "production" }), true);
});

test("both existing production-only UI gates use the shared hosting policy", () => {
  for (const file of ["src/app/onboarding/page.tsx", "src/app/m/dev/cards/page.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /isProductionDeployment\(\)/);
    assert.doesNotMatch(source, /process\.env\.VERCEL_ENV/);
  }
});
