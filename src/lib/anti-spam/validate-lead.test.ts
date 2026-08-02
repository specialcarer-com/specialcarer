import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLead,
  looksLikeRandomString,
  isFreeWebmail,
  isValidUkPhone,
} from "./validate-lead";

test("looksLikeRandomString flags the real spam sample fields", () => {
  assert.equal(looksLikeRandomString("VAlixLMjkpizrfgKjwy"), true);
  assert.equal(looksLikeRandomString("wpruMKHDWMIkwOvDnV"), true);
  assert.equal(looksLikeRandomString("geOUHPHUBfjagztpFHBO"), true);
});

test("looksLikeRandomString does not flag real names, orgs, and roles", () => {
  const legit = [
    "Sarah Johnson",
    "McDonald's Care Ltd",
    "O'Brien-Smith",
    "Registered manager",
    "NHS Trust",
    "Placement officer",
    "Jean-Pierre",
    "St Mary's Hospice",
    "Occupational Therapist",
    "Workforce / HR manager",
    "Anne-Marie O'Connell",
    "DBS Officer",
    "McKenzie Care Group",
    "iPhone Solutions Ltd",
    "McKinsey & Company",
    "eBay Ltd",
    "PwC",
  ];
  for (const field of legit) {
    assert.equal(looksLikeRandomString(field), false, `expected "${field}" to pass`);
  }
});

test("isFreeWebmail blocks common personal domains, including dot-obfuscation", () => {
  assert.equal(isFreeWebmail("wayn.e.h.u.d.i.s@gmail.com"), true);
  assert.equal(isFreeWebmail("someone@hotmail.co.uk"), true);
  assert.equal(isFreeWebmail("person@yandex.ru"), true);
  assert.equal(isFreeWebmail("careers@nhs.uk"), false);
  assert.equal(isFreeWebmail("procurement@somecarehome.co.uk"), false);
});

test("isValidUkPhone accepts UK formats and rejects US formats", () => {
  assert.equal(isValidUkPhone("07700 900123"), true);
  assert.equal(isValidUkPhone("020 7946 0958"), true);
  assert.equal(isValidUkPhone("+44 7700 900123"), true);
  assert.equal(isValidUkPhone("01632 960000"), true);

  // The exact spammer example: US Utah area code.
  assert.equal(isValidUkPhone("8019356672"), false);
  assert.equal(isValidUkPhone("+1 801 935 6672"), false);
  assert.equal(isValidUkPhone("12345"), false);
});

test("validateLead rejects the full spam example from the /organisations form", () => {
  const result = validateLead({
    name: "VAlixLMjkpizrfgKjwy",
    email: "wayn.e.h.u.d.i.s@gmail.com",
    org: "wpruMKHDWMIkwOvDnV",
    role: "geOUHPHUBfjagztpFHBO",
    phone: "8019356672",
  });
  assert.equal(result.valid, false);
  assert.ok(result.reason);
});

test("validateLead accepts a plausible genuine B2B enquiry", () => {
  const result = validateLead({
    name: "Sarah Johnson",
    email: "sarah.johnson@somecarehome.co.uk",
    org: "Some Care Home Group",
    role: "Registered manager",
    phone: "07700 900123",
  });
  assert.deepEqual(result, { valid: true });
});

test("validateLead accepts a genuine enquiry with no phone supplied and not required", () => {
  const result = validateLead({
    name: "Priya Patel",
    email: "priya@nhs.uk",
    org: "NHS Trust",
    role: "Discharge coordinator",
    phone: "",
    phoneRequired: false,
  });
  assert.deepEqual(result, { valid: true });
});

test("validateLead rejects when phone is required but missing", () => {
  const result = validateLead({
    name: "Priya Patel",
    email: "priya@nhs.uk",
    org: "NHS Trust",
    role: "Discharge coordinator",
    phone: "",
    phoneRequired: true,
  });
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /UK phone number/);
});
