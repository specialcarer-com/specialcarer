import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const client = readFileSync(new URL("./verification-client.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("verification page while uCheck is not live", () => {
  it("does not promise a manual process or a timescale carers cannot act on", () => {
    assert.doesNotMatch(client, /manually/i);
    assert.doesNotMatch(client, /one working day/i);
    assert.doesNotMatch(client, /received your documents/i);
  });
  it("tells the carer how to send documents now and points to useful next steps", () => {
    assert.match(client, /Our team can check your documents now/);
    assert.match(client, /send your documents in the section below/);
    assert.match(client, /\/dashboard\/profile/);
    assert.match(client, /\/dashboard\/support/);
  });
  it("does not name the vendor or promise an email nobody sends", () => {
    const stub = client.slice(client.indexOf("if (stubMode)"), client.indexOf("\n  }\n", client.indexOf("if (stubMode)")));
    assert.ok(stub.length > 100);
    assert.doesNotMatch(stub, /uCheck|Checkr/);
    assert.doesNotMatch(stub, /email\s+you/i);
    assert.doesNotMatch(page, /run securely by uCheck/);
  });
  it("keeps state-appropriate copy for carers who already have checks", () => {
    assert.match(page, /isUCheckStubMode\(\) && !anyStarted && !allCleared/);
    assert.match(page, /stubWithChecks=\{stubWithChecks\}/);
    assert.match(client, /stubWithChecks/);
    assert.match(client, /already under way/);
  });
  it("hides the 'redirect you to uCheck' text while in stub mode", () => {
    assert.match(page, /const stubMode =\s*country === "GB" && isUCheckStubMode\(\)/);
    assert.match(page, /stubMode\s*\n?\s*\? "Send your documents for review"/);
  });
  it("does not say we never see documents while carers can send us documents", () => {
    assert.match(page, /showManual \?/);
    assert.match(page, /seen only by named SpecialCarer staff/);
  });
});
