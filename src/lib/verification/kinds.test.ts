import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KINDS,
  KIND_KEYS,
  detectMime,
  fileAllowed,
  normaliseShareCode,
  storagePath,
  validateDecision,
  validateSubmission,
} from "./kinds";

describe("verification kinds config", () => {
  it("covers every kind with fields and a checklist", () => {
    for (const k of KIND_KEYS) {
      assert.ok(KINDS[k].fields.length > 0, k);
      assert.ok(KINDS[k].checklist.length > 0, k);
    }
  });
  it("only the three publish-gating kinds map to background checks", () => {
    const mapped = KIND_KEYS.filter((k) => KINDS[k].bgCheckType).sort();
    assert.deepEqual(mapped, ["dbs", "identity", "right_to_work"]);
  });
  it("photo ID files are deleted after a decision", () => {
    assert.equal(KINDS.identity.deleteFilesOnDecision, true);
    assert.notEqual(KINDS.dbs.deleteFilesOnDecision, true);
  });
});

describe("validateSubmission", () => {
  it("normalises a share code and checks date of birth", () => {
    const r = validateSubmission("right_to_work", { share_code: "w12-345 678", date_of_birth: "1990-05-01" }, []);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.data.share_code, "W12345678");
    assert.equal(normaliseShareCode(" ab-cd "), "ABCD");
  });
  it("rejects a bad share code and an impossible date of birth", () => {
    const r = validateSubmission("right_to_work", { share_code: "123", date_of_birth: "2023-02-30" }, []);
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.errors.length, 2);
  });
  it("DBS needs 12 digits, a file and consent", () => {
    const bad = validateSubmission("dbs", { certificate_number: "12345", date_of_birth: "1985-01-01" }, []);
    assert.ok(!bad.ok);
    const good = validateSubmission(
      "dbs",
      { certificate_number: "0012 3456 7890", date_of_birth: "1985-01-01", consent_update_service: "true" },
      ["certificate_photo"],
    );
    assert.ok(good.ok);
    if (good.ok) {
      assert.equal(good.data.certificate_number, "001234567890");
      assert.equal(good.consent, true);
    }
  });
  it("identity needs a document type from the list and a photo", () => {
    assert.ok(!validateSubmission("identity", { id_type: "library_card" }, ["id_photo"]).ok);
    assert.ok(validateSubmission("identity", { id_type: "passport" }, ["id_photo"]).ok);
    assert.ok(!validateSubmission("identity", { id_type: "passport" }, []).ok);
  });
  it("references need valid emails", () => {
    const base = { ref1_name: "A", ref1_relationship: "Manager", ref1_email: "a@x.co", ref2_name: "B", ref2_relationship: "Manager", ref2_email: "nope" };
    assert.ok(!validateSubmission("references", base, []).ok);
    assert.ok(validateSubmission("references", { ...base, ref2_email: "b@x.co" }, []).ok);
  });
});

describe("validateDecision", () => {
  const all = (k: keyof typeof KINDS) => Object.fromEntries(KINDS[k].checklist.map((c) => [c.key, true]));
  it("requires every checklist item to approve", () => {
    const partial = { ...all("dbs"), update_service_status_current: false };
    assert.ok(!validateDecision("dbs", "approved", partial, "", null).ok);
    assert.ok(validateDecision("dbs", "approved", all("dbs"), "", null).ok);
  });
  it("requires a reason to reject", () => {
    assert.ok(!validateDecision("dbs", "rejected", {}, "no", null).ok);
    assert.ok(validateDecision("dbs", "rejected", {}, "Certificate unreadable, please resubmit", null).ok);
  });
  it("accepts a future expiry only where allowed", () => {
    const now = new Date("2026-10-16T00:00:00Z");
    const r = validateDecision("right_to_work", "approved", all("right_to_work"), "", "2027-03-01", now);
    assert.ok(r.ok);
    assert.ok(!validateDecision("right_to_work", "approved", all("right_to_work"), "", "2026-01-01", now).ok);
    assert.ok(!validateDecision("dbs", "approved", all("dbs"), "", "2027-03-01", now).ok);
  });
});

describe("files", () => {
  it("builds a per-user path and restricts types", () => {
    assert.equal(storagePath("u1", "s1", "id_photo", "image/png"), "u1/s1/id_photo.png");
    assert.ok(fileAllowed("image", "image/jpeg"));
    assert.ok(!fileAllowed("image", "application/pdf"));
    assert.ok(fileAllowed("image_or_pdf", "application/pdf"));
    assert.ok(!fileAllowed("image_or_pdf", "text/html"));
  });
});

describe("detectMime", () => {
  it("identifies formats from content, not from a label", () => {
    assert.equal(detectMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0])), "image/jpeg");
    assert.equal(detectMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(detectMime(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
    assert.equal(detectMime(new TextEncoder().encode("%PDF-1.7")), "application/pdf");
    assert.equal(detectMime(new TextEncoder().encode("<html><script>alert(1)</script>")), null);
    assert.equal(detectMime(new Uint8Array()), null);
  });
});

describe("decision flow order", () => {
  it("claims the submission before deleting photo evidence", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../app/admin/verification/actions.ts", import.meta.url), "utf8");
    const claim = src.indexOf('.eq("status", "submitted")');
    const del = src.indexOf("storage.from(BUCKET).remove");
    assert.ok(claim > 0 && del > claim, "claim must come before file deletion");
  });
});

describe("submit and decide safeguards", () => {
  it("gates the submit route on stub mode and scopes rollback deletes", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync(new URL("../../app/api/verification/submit/route.ts", import.meta.url), "utf8");
    assert.match(route, /!isUCheckStubMode\(\)/);
    assert.equal((route.match(/\.delete\(\)\.eq\("id", row\.id\)\.eq\("status", "submitted"\)/g) ?? []).length, 2);
    assert.doesNotMatch(route, /\.delete\(\)\.eq\("id", row\.id\);/);
  });
  it("never approves without files and never requeues after the photo is deleted", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../app/admin/verification/actions.ts", import.meta.url), "utf8");
    assert.match(src, /uploaded files are not ready yet/);
    assert.match(src, /status: "rejected",\s*review_note: "System:/);
  });
});
