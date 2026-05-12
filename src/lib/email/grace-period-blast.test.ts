import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  _renderGracePeriodBlastHtml,
  _renderGracePeriodBlastText,
} from "./grace-period-blast";

const base = {
  fullName: "Priya Sharma",
  email: "priya@example.com",
  missingCourses: ["food-hygiene", "medication-administration"],
  graceEndsAt: "2026-06-11T00:00:00.000Z",
  worksWithAdults: true,
  worksWithChildren: false,
};

describe("grace-period-blast templates", () => {
  it("HTML names the carer, deadline, and each missing course", () => {
    const html = _renderGracePeriodBlastHtml(base);
    assert.match(html, /Priya Sharma/);
    assert.match(html, /11 June 2026/);
    assert.match(html, /Food hygiene/);
    assert.match(html, /Medication administration/);
    assert.match(html, /<strong>adults<\/strong>/);
  });

  it("text version mirrors HTML payload", () => {
    const text = _renderGracePeriodBlastText(base);
    assert.match(text, /Priya Sharma/);
    assert.match(text, /11 June 2026/);
    assert.match(text, /Food hygiene/);
    assert.match(text, /Medication administration/);
  });

  it("renders correct population copy for child carer", () => {
    const html = _renderGracePeriodBlastHtml({
      ...base,
      worksWithAdults: false,
      worksWithChildren: true,
      missingCourses: ["safeguarding-children"],
    });
    assert.match(html, /<strong>children<\/strong>/);
    assert.match(html, /Safeguarding children/);
  });

  it("renders dual population for adults+children", () => {
    const html = _renderGracePeriodBlastHtml({
      ...base,
      worksWithAdults: true,
      worksWithChildren: true,
      missingCourses: ["safeguarding-adults", "safeguarding-children"],
    });
    assert.match(html, /both adults and children/);
  });

  it("includes the deep-link to each course", () => {
    const html = _renderGracePeriodBlastHtml(base);
    assert.match(html, /\/dashboard\/training\/food-hygiene/);
    assert.match(html, /\/dashboard\/training\/medication-administration/);
  });
});
