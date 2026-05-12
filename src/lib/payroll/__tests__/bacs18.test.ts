/**
 * Unit tests for BACS Standard 18 generator + validator.
 *
 * Pattern matches src/lib/payroll/__tests__/compute-pay.test.ts — no
 * external test runner, just `node:assert` + tsx. Run with:
 *   npx tsx src/lib/payroll/__tests__/bacs18.test.ts
 *
 * The byte-for-byte fixture below was produced by running the generator
 * with the deterministic inputs in `case3PaymentInput()` (creation date
 * and expiration date are explicit so the snapshot is reproducible).
 */

import { strict as assert } from "node:assert";
import {
  generateBacs18File,
  BACS18_LINE_WIDTH,
  type Bacs18Input,
} from "../bacs18";
import { validateBacs18Input } from "../bacs18-validate";

type Test = { name: string; run: () => void };
const tests: Test[] = [];
const test = (name: string, run: () => void) => tests.push({ name, run });

// ─── Fixture inputs ──────────────────────────────────────────────────────────
function case3PaymentInput(): Bacs18Input {
  return {
    originator: {
      sun: "123456",
      sortCode: "207692",
      accountNumber: "12345678",
      name: "ALL CARE 4 U GROUP",
    },
    submission: {
      serialNumber: 1,
      processingDate: new Date(Date.UTC(2026, 5, 1)), // 2026-06-01 = day 152
      creationDate: new Date(Date.UTC(2026, 4, 30)),  // 2026-05-30 = day 150
      expirationDate: new Date(Date.UTC(2026, 10, 30)), // 2026-11-30 = day 334
      currencyCode: "GBP",
    },
    payments: [
      {
        payeeSortCode: "112233",
        payeeAccountNumber: "11112222",
        payeeName: "ALICE CARER",
        amountPence: 150000,
        reference: "SPC-202605-A1B2C3",
        transactionCode: "99",
      },
      {
        payeeSortCode: "445566",
        payeeAccountNumber: "33334444",
        payeeName: "BOB CARER",
        amountPence: 100050,
        reference: "SPC-202605-D4E5F6",
        transactionCode: "99",
      },
      {
        payeeSortCode: "778899",
        payeeAccountNumber: "55556666",
        payeeName: "CHARLIE CARER",
        amountPence: 75025,
        reference: "SPC-202605-G7H8I9",
        transactionCode: "99",
      },
    ],
  };
}

// ─── Snapshot ────────────────────────────────────────────────────────────────
// Byte-for-byte expected output. CRLF line endings; trailing CRLF after EOV1.
// Every line is exactly 106 characters; total length = 9 * (106 + 2) = 972.
const EXPECTED_FIXTURE = [
  "VOL1000001                           123456                                    1                          ",
  "HDR1A123456S   12345600000100010001       26150 26334 000000                                              ",
  "UHL1 26152999999    00      1 DAILY  001                                                                  ",
  "1122331111222209920769212345678    00000150000ALL CARE 4 U GROUPSPC-202605-A1B2C3 ALICE CARER             ",
  "4455663333444409920769212345678    00000100050ALL CARE 4 U GROUPSPC-202605-D4E5F6 BOB CARER               ",
  "7788995555666609920769212345678    00000075025ALL CARE 4 U GROUPSPC-202605-G7H8I9 CHARLIE CARER           ",
  "2076921234567801720769212345678    00000325075PAYROLL 20260601  CONTRA            ALL CARE 4 U GROUP      ",
  "UTL10000000325075000000032507500000010000003                                                              ",
  "EOF1A123456S   12345600000100010001       26150 26334 000000                                              ",
  "EOV1000001                           123456                                    1                          ",
].join("\r\n") + "\r\n";

// ─── Tests ───────────────────────────────────────────────────────────────────

test("byte-for-byte snapshot — 3 payments", () => {
  const r = generateBacs18File(case3PaymentInput());
  assert.equal(r.error, null, `unexpected error: ${r.error}`);
  // Cross-check each fixture line is 106 chars (catches accidental edits
  // to the fixture itself, not just the generator).
  const fixLines = EXPECTED_FIXTURE.split("\r\n");
  for (let i = 0; i < fixLines.length - 1; i++) {
    assert.equal(
      fixLines[i].length,
      106,
      `fixture line ${i} length ${fixLines[i].length} != 106`,
    );
  }
  assert.equal(r.content, EXPECTED_FIXTURE);
});

test("every record is exactly 106 chars; CRLF separated", () => {
  const r = generateBacs18File(case3PaymentInput());
  assert.equal(r.error, null);
  // Trailing CRLF means split produces an empty last element.
  const lines = r.content.split("\r\n");
  assert.equal(lines[lines.length - 1], "", "must end with CRLF");
  const dataLines = lines.slice(0, -1);
  for (let i = 0; i < dataLines.length; i++) {
    assert.equal(
      dataLines[i].length,
      BACS18_LINE_WIDTH,
      `line ${i} length ${dataLines[i].length}`,
    );
  }
});

test("record count = 1+1+1+N+1+1+1+1 (VOL1,HDR1,UHL1,payments,contra,UTL1,EOF1,EOV1)", () => {
  const r = generateBacs18File(case3PaymentInput());
  assert.equal(r.error, null);
  const lines = r.content.split("\r\n").slice(0, -1);
  // 3 payments → 9 records total.
  assert.equal(lines.length, 3 /*payments*/ + 7 /*headers/trailers*/);
  assert.ok(lines[0].startsWith("VOL1"));
  assert.ok(lines[1].startsWith("HDR1"));
  assert.ok(lines[2].startsWith("UHL1"));
  // Contra is the line BEFORE UTL1.
  const utl1Index = lines.findIndex((l) => l.startsWith("UTL1"));
  assert.ok(utl1Index > 0, "UTL1 record missing");
  // The line before UTL1 should be the contra (originator sort+account, txn 17).
  const contra = lines[utl1Index - 1];
  assert.equal(
    contra.slice(0, 6),
    "207692",
    "contra should start with originator sort code",
  );
  assert.equal(
    contra.slice(15, 17),
    "17",
    "contra transaction code should be 17",
  );
  // EOF1 + EOV1 round out the tail.
  assert.ok(lines[utl1Index + 1].startsWith("EOF1"));
  assert.ok(lines[utl1Index + 2].startsWith("EOV1"));
});

test("contra amount equals sum of all payment amounts", () => {
  const input = case3PaymentInput();
  const expectedTotal = input.payments.reduce(
    (s, p) => s + p.amountPence,
    0,
  );
  const r = generateBacs18File(input);
  assert.equal(r.error, null);
  const lines = r.content.split("\r\n").slice(0, -1);
  const utl1Index = lines.findIndex((l) => l.startsWith("UTL1"));
  const contra = lines[utl1Index - 1];
  // Amount field is positions 36–46 (11 chars), 0-indexed 35..45 (exclusive 46).
  const amountStr = contra.slice(35, 46);
  assert.equal(Number(amountStr), expectedTotal);
  assert.equal(amountStr, "00000325075");
});

test("UTL1 totals + counts match payments", () => {
  const r = generateBacs18File(case3PaymentInput());
  assert.equal(r.error, null);
  const lines = r.content.split("\r\n").slice(0, -1);
  const utl1 = lines.find((l) => l.startsWith("UTL1"))!;
  // 1-3 UTL, 4 '1', 5-17 debit total (13), 18-30 credit total (13), 31-37
  // debit count (7), 38-44 credit count (7). 0-indexed: 0..4, 4..17, 17..30,
  // 30..37, 37..44.
  const debitTotal = utl1.slice(4, 17);
  const creditTotal = utl1.slice(17, 30);
  const debitCount = utl1.slice(30, 37);
  const creditCount = utl1.slice(37, 44);
  assert.equal(Number(debitTotal), 325075);
  assert.equal(Number(creditTotal), 325075);
  assert.equal(Number(debitCount), 1, "exactly one contra");
  assert.equal(Number(creditCount), 3, "three payments");
});

test("warnings array always includes the 106-line-width disclosure", () => {
  const r = generateBacs18File(case3PaymentInput());
  assert.equal(r.error, null);
  assert.ok(
    r.warnings.some((w) => w.includes("106 chars per parent brief")),
    "missing 106-char warning",
  );
});

// ─── Validator tests ─────────────────────────────────────────────────────────

test("validator: happy input", () => {
  const v = validateBacs18Input(case3PaymentInput());
  assert.equal(v.ok, true);
});

test("validator: bad sort code length", () => {
  const input = case3PaymentInput();
  input.payments[0].payeeSortCode = "12345"; // 5 digits
  const v = validateBacs18Input(input);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected error");
  assert.ok(v.errors.some((e) => e.includes("payeeSortCode")));
});

test("validator: bad account number length", () => {
  const input = case3PaymentInput();
  input.payments[1].payeeAccountNumber = "1234567"; // 7 digits
  const v = validateBacs18Input(input);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected error");
  assert.ok(v.errors.some((e) => e.includes("payeeAccountNumber")));
});

test("validator: name too long", () => {
  const input = case3PaymentInput();
  input.payments[0].payeeName = "ALICE CARER VERY VERY LONG"; // 26 chars
  const v = validateBacs18Input(input);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected error");
  assert.ok(v.errors.some((e) => e.includes("payeeName")));
});

test("validator: zero amount", () => {
  const input = case3PaymentInput();
  input.payments[0].amountPence = 0;
  const v = validateBacs18Input(input);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected error");
  assert.ok(v.errors.some((e) => e.includes("amountPence")));
});

test("validator: amount over £20m sanity cap", () => {
  const input = case3PaymentInput();
  input.payments[0].amountPence = 2_000_000_001; // £20,000,000.01
  const v = validateBacs18Input(input);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected error");
  assert.ok(v.errors.some((e) => e.toLowerCase().includes("sanity")));
});

test("validator: missing SUN", () => {
  const input = case3PaymentInput();
  input.originator.sun = "";
  const v = validateBacs18Input(input);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected error");
  assert.ok(v.errors.some((e) => e.includes("sun")));
});

test("validator: invalid characters in payee name", () => {
  const input = case3PaymentInput();
  input.payments[0].payeeName = "ALICE@CARER"; // @ not allowed
  const v = validateBacs18Input(input);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected error");
  assert.ok(v.errors.some((e) => e.includes("invalid characters")));
});

test("validator: txn code must be 99", () => {
  const input = case3PaymentInput();
  // @ts-expect-error — testing runtime guard
  input.payments[0].transactionCode = "01";
  const v = validateBacs18Input(input);
  assert.equal(v.ok, false);
  if (v.ok) throw new Error("expected error");
  assert.ok(v.errors.some((e) => e.includes("transactionCode")));
});

test("generator: returns error and empty content when validation fails", () => {
  const input = case3PaymentInput();
  input.originator.sun = "";
  const r = generateBacs18File(input);
  assert.equal(r.content, "");
  assert.ok(r.error);
  assert.ok(r.error!.includes("Validation failed"));
});

// ─── Feature flag integration test ───────────────────────────────────────────
// We can't full-stack the route handler here, but we CAN assert that with
// the env flag off the route exports its POST and returns a 404-shaped
// JSON. The route lives at ../../../app/api/admin/payroll/runs/[id]/bacs-export/route.ts.
test("route returns 404 JSON when FEATURE_BACS18_EXPORT_ENABLED is unset", async () => {
  // Snapshot + clear the flag for this test.
  const prev = process.env.FEATURE_BACS18_EXPORT_ENABLED;
  delete process.env.FEATURE_BACS18_EXPORT_ENABLED;
  try {
    const mod = await import(
      "../../../app/api/admin/payroll/runs/[id]/bacs-export/route"
    );
    const res = (await mod.POST(new Request("http://x/", { method: "POST" }), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    })) as Response;
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "not_found");
  } finally {
    if (prev !== undefined) {
      process.env.FEATURE_BACS18_EXPORT_ENABLED = prev;
    }
  }
});

// ─── Runner ─────────────────────────────────────────────────────────────────
async function main() {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`  PASS  ${t.name}`);
      pass++;
    } catch (e) {
      fail++;
      console.error(`  FAIL  ${t.name}`);
      console.error(e instanceof Error ? e.message : e);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
void main();
