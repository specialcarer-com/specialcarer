import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLead,
  looksLikeRandomStringName,
  looksLikeRandomStringOrgOrRole,
  isFreeWebmail,
  isGmail,
  normaliseEmail,
  isValidUkPhone,
} from "./validate-lead";

test("looksLikeRandomStringName flags the real spam sample name fields", () => {
  assert.equal(looksLikeRandomStringName("VAlixLMjkpizrfgKjwy"), true);
  assert.equal(looksLikeRandomStringName("QUjIzYHOGLMTSFmpXhd"), true);
  assert.equal(looksLikeRandomStringName("GRNaFpHOClPPiJYyk"), true);
  assert.equal(looksLikeRandomStringName("nOxkjEYTILjlpqXCj"), true);
  assert.equal(looksLikeRandomStringName("eBCukaOeDmztrKZtiWlg"), true);
  assert.equal(looksLikeRandomStringName("WstWksfjByEwYPNWnX"), true);
});

test("looksLikeRandomStringOrgOrRole flags the real spam sample org/role fields", () => {
  // Most corpus org/role samples are caught by the case-chaos signal in
  // isolation. "geOUHPHUBfjagztpFHBO" (only 3 case transitions, 20
  // chars) is NOT individually flagged by this narrower org/role check
  // — that's expected and fine, since it's still caught in practice via
  // MULTI_FIELD_RANDOM (its sibling name/org fields in the same
  // submission are random) — see the full-corpus `validateLead` test
  // below, which is what actually matters end-to-end.
  assert.equal(looksLikeRandomStringOrgOrRole("wpruMKHDWMIkwOvDnV"), true);
  assert.equal(looksLikeRandomStringOrgOrRole("fHcMwYNCgacPiQSVxEqbYsb"), true);
  assert.equal(looksLikeRandomStringOrgOrRole("NtRVaUMUFXlqswYy"), true);
  assert.equal(looksLikeRandomStringOrgOrRole("mcZvOIfnerFsqjFQwzRgRT"), true);
  assert.equal(looksLikeRandomStringOrgOrRole("SburxvIuIYLClDhmqBxJpU"), true);
});

test("looksLikeRandomStringName does not flag real names, orgs, and roles", () => {
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
    assert.equal(looksLikeRandomStringName(field), false, `expected "${field}" to pass`);
  }
});

test("Welsh names pass looksLikeRandomStringName (w/y semi-vowel fix)", () => {
  const welsh = ["Rhys", "Llywelyn", "Cwmbran", "Gruffydd", "Blodwyn", "Bronwyn", "Meirionnydd", "Pwllheli", "Gwynfor"];
  for (const name of welsh) {
    assert.equal(looksLikeRandomStringName(name), false, `expected Welsh name "${name}" to pass`);
  }
});

test("Zulu/Xhosa names pass looksLikeRandomStringName", () => {
  const names = ["Siphosethu", "Mthembu", "Nxamalala"];
  for (const name of names) {
    assert.equal(looksLikeRandomStringName(name), false, `expected "${name}" to pass`);
  }
});

test("Polish/Ukrainian names pass looksLikeRandomStringName", () => {
  const names = ["Krzysztof Szczepański", "Volodymyr Shevchenko"];
  for (const name of names) {
    assert.equal(looksLikeRandomStringName(name), false, `expected "${name}" to pass`);
  }
});

test("Tamil names pass looksLikeRandomStringName", () => {
  const names = ["Thirunavukkarasu", "Karthikeyan"];
  for (const name of names) {
    assert.equal(looksLikeRandomStringName(name), false, `expected "${name}" to pass`);
  }
});

test("Igbo/Yoruba names pass looksLikeRandomStringName", () => {
  const names = ["Nnamdi", "Ngozi", "Chukwuemeka"];
  for (const name of names) {
    assert.equal(looksLikeRandomStringName(name), false, `expected "${name}" to pass`);
  }
});

test("Real job titles pass looksLikeRandomStringOrgOrRole (role field)", () => {
  const roles = ["Psychologist", "Physiotherapist", "Ophthalmologist"];
  for (const role of roles) {
    assert.equal(looksLikeRandomStringOrgOrRole(role), false, `expected role "${role}" to pass`);
  }
});

test("Real org names pass looksLikeRandomStringOrgOrRole (org field)", () => {
  const orgs = ["Cwmni Gofal Cymru Ltd", "Rhythm Care Ltd"];
  for (const org of orgs) {
    assert.equal(looksLikeRandomStringOrgOrRole(org), false, `expected org "${org}" to pass`);
  }
});

test("isFreeWebmail blocks common personal domains, including dot-obfuscation", () => {
  assert.equal(isFreeWebmail("wayn.e.h.u.d.i.s@gmail.com"), true);
  assert.equal(isFreeWebmail("someone@hotmail.co.uk"), true);
  assert.equal(isFreeWebmail("person@yandex.ru"), true);
  assert.equal(isFreeWebmail("careers@nhs.uk"), false);
  assert.equal(isFreeWebmail("procurement@somecarehome.co.uk"), false);
});

test("isFreeWebmail includes UK ISP webmail domains", () => {
  const domains = [
    "btinternet.com",
    "sky.com",
    "virginmedia.com",
    "talktalk.net",
    "ntlworld.com",
    "tiscali.co.uk",
    "blueyonder.co.uk",
    "orange.net",
  ];
  for (const domain of domains) {
    assert.equal(isFreeWebmail(`someone@${domain}`), true, `expected ${domain} to be blocked`);
  }
});

test("trailing-dot email bypass is closed", () => {
  assert.equal(isFreeWebmail("bot@gmail.com."), true);
  assert.equal(normaliseEmail("bot@gmail.com.").endsWith("@gmail.com"), true);
});

test("isGmail is specific to Gmail, not other free-webmail providers", () => {
  assert.equal(isGmail("a@gmail.com"), true);
  assert.equal(isGmail("a@googlemail.com"), true);
  assert.equal(isGmail("a@yahoo.com"), false);
  assert.equal(isGmail("a@hotmail.com"), false);
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
  assert.equal(result.reasonCode, "MULTI_FIELD_RANDOM");
  assert.ok(result.reason);
});

test("validateLead rejects the entire real spam corpus via MULTI_FIELD_RANDOM", () => {
  const corpus = [
    {
      name: "VAlixLMjkpizrfgKjwy",
      email: "wayn.e.h.u.d.i.s@gmail.com",
      org: "wpruMKHDWMIkwOvDnV",
      role: "geOUHPHUBfjagztpFHBO",
    },
    {
      name: "QUjIzYHOGLMTSFmpXhd",
      email: "ebe.da.xem.ax.on.0.8@gmail.com",
      org: "fHcMwYNCgacPiQSVxEqbYsb",
      role: "NtRVaUMUFXlqswYy",
    },
    {
      name: "GRNaFpHOClPPiJYyk",
      email: "visanchez@salud.unm.edu",
      org: "mcZvOIfnerFsqjFQwzRgRT",
      role: "SburxvIuIYLClDhmqBxJpU",
    },
    {
      name: "nOxkjEYTILjlpqXCj",
      email: "patty.swain@childrenscenterofthecumberlands.org",
      org: "jsCqtCPciFdCGDsRQdzfNIj",
      role: "rfthZXMIsapVXFrcHChNZamf",
    },
    {
      name: "eBCukaOeDmztrKZtiWlg",
      email: "mread@stratfordschools.com",
      org: "zrtXoVzFGOOmKxYQG",
      role: "rFpugKaDFfYLLWFE",
    },
    {
      name: "WstWksfjByEwYPNWnX",
      email: "info@bearcreekdentalclinic.ca",
      org: "yIOZJabbYRsWGLuj",
      role: "LqkUPpngynjFsGWnKqt",
    },
  ];
  for (const sample of corpus) {
    const result = validateLead(sample);
    assert.equal(result.valid, false, `expected corpus sample "${sample.name}" to fail`);
    assert.equal(
      result.reasonCode,
      "MULTI_FIELD_RANDOM",
      `expected corpus sample "${sample.name}" to fail via MULTI_FIELD_RANDOM, got ${result.reasonCode}`,
    );
  }
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

test("validateLead accepts diverse legitimate names/orgs/roles that would trip a naive check", () => {
  const result = validateLead({
    name: "Rhys Gwynfor",
    email: "rhys@cwmniofalcymru.co.uk",
    org: "Cwmni Gofal Cymru Ltd",
    role: "Registered manager",
  });
  assert.deepEqual(result, { valid: true });

  const result2 = validateLead({
    name: "Thirunavukkarasu Karthikeyan",
    email: "t.karthikeyan@somecarehome.co.uk",
    org: "Rhythm Care Ltd",
    role: "Psychologist",
  });
  assert.deepEqual(result2, { valid: true });
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
  assert.equal(result.reasonCode, "INVALID_UK_PHONE");
  assert.match(result.reason ?? "", /UK phone number/);
});

test("validateLead treats trailing-dot Gmail as Gmail (closes the free-webmail bypass)", () => {
  const result = validateLead({
    name: "Bob Jones",
    email: "bot@gmail.com.",
    org: "Real Org Ltd",
    role: "Manager",
  });
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, "FREE_WEBMAIL");
});

test("validateLead rejects non-Gmail free webmail with a hard block (no override)", () => {
  const result = validateLead({
    name: "Sarah Johnson",
    email: "sarah@yahoo.com",
    org: "Tiny Care CIC",
    role: "Founder",
  });
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, "FREE_WEBMAIL");
  assert.equal(result.soft, false);
});

test("validateLead soft-blocks Gmail with an override token, and the override lets it through", () => {
  const gmailLead = {
    name: "Sarah Johnson",
    email: "sarah@gmail.com",
    org: "Tiny Care CIC",
    role: "Founder",
  };
  const first = validateLead(gmailLead);
  assert.equal(first.valid, false);
  assert.equal(first.reasonCode, "FREE_WEBMAIL");
  assert.equal(first.soft, true);

  const resubmitted = validateLead({ ...gmailLead, usePersonalEmail: true });
  assert.deepEqual(resubmitted, { valid: true });
});
