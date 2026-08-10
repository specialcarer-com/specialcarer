import assert from "node:assert/strict";
import { test } from "node:test";
import { consentPdfErrorMessage } from "./consent-pdf";

test("consent PDF errors are retained as a bounded, actionable message", () => {
  assert.equal(
    consentPdfErrorMessage(new Error("Storage upload failed")),
    "Storage upload failed"
  );
  assert.equal(consentPdfErrorMessage(null), "Unknown PDF generation error");
  assert.equal(
    consentPdfErrorMessage(new Error("x".repeat(1001))).length,
    1000
  );
});
