import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const FAM_KEY = "NEXT_PUBLIC_FAMILY_CARE_PLAN_VIEW_ENABLED";
const REG_KEY = "NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED";
const famOriginal = process.env[FAM_KEY];
const regOriginal = process.env[REG_KEY];

afterEach(() => {
  if (famOriginal === undefined) delete process.env[FAM_KEY];
  else process.env[FAM_KEY] = famOriginal;
  if (regOriginal === undefined) delete process.env[REG_KEY];
  else process.env[REG_KEY] = regOriginal;
});

async function freshFlag() {
  const mod = await import(`./flag.ts?ts=${Date.now()}-${Math.random()}`);
  return mod as typeof import("./flag");
}

test("family flag defaults to false when unset", async () => {
  delete process.env[FAM_KEY];
  const { isFamilyCarePlanViewEnabled } = await freshFlag();
  assert.equal(isFamilyCarePlanViewEnabled(), false);
});

test("family flag is true only for the exact string 'true'", async () => {
  process.env[FAM_KEY] = "true";
  assert.equal((await freshFlag()).isFamilyCarePlanViewEnabled(), true);
  process.env[FAM_KEY] = "1";
  assert.equal((await freshFlag()).isFamilyCarePlanViewEnabled(), false);
  process.env[FAM_KEY] = "TRUE";
  assert.equal((await freshFlag()).isFamilyCarePlanViewEnabled(), false);
  process.env[FAM_KEY] = "";
  assert.equal((await freshFlag()).isFamilyCarePlanViewEnabled(), false);
});

test("reg9 flag defaults to false when unset", async () => {
  delete process.env[REG_KEY];
  const { isReg9ReviewCadenceEnabled } = await freshFlag();
  assert.equal(isReg9ReviewCadenceEnabled(), false);
});

test("reg9 flag is true only for the exact string 'true'", async () => {
  process.env[REG_KEY] = "true";
  assert.equal((await freshFlag()).isReg9ReviewCadenceEnabled(), true);
  process.env[REG_KEY] = "false";
  assert.equal((await freshFlag()).isReg9ReviewCadenceEnabled(), false);
});
