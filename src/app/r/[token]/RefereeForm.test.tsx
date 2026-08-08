import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReferenceType } from "@/lib/vetting/types";
import RefereeForm from "./RefereeForm";

for (const referenceType of [
  "employer",
  "character",
  "professional",
  "client",
] as const satisfies readonly ReferenceType[]) {
  test(`reference form sections snapshot: ${referenceType}`, () => {
    const html = renderToStaticMarkup(
      h(RefereeForm, {
        token: "test-token",
        carerName: "Aisha Khan",
        refereeName: "Morgan Smith",
        refereeEmail: "morgan@example.org",
        initialReferenceType: referenceType,
      }),
    );

    assert.match(html, /Candidate details/);
    assert.match(html, /About the candidate/);
    assert.match(html, /Rating/);
    assert.match(html, /About you/);
    assert.match(html, /Data Protection/);
    assert.match(html, /SpecialCarer requests this data solely/);
    if (referenceType === "character") {
      assert.doesNotMatch(html, /Employment start date/);
    } else {
      assert.match(html, /Employment start date/);
      assert.match(html, /Days absent in the last 12 months/);
    }
  });
}
