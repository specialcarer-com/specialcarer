/**
 * DSAR exporter 1.3.0 behaviour tests: withheld columns, child tables,
 * email-keyed tables, request chunking and the row-limit warning.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { exportSubject, type ExportAdminClient } from "./export";

type Call = { table: string; kind: "eq" | "or"; arg: string; value?: string };

function makeAdmin(rows: Record<string, unknown[]>, calls: Call[] = []): ExportAdminClient {
  const respond = (table: string) => ({ data: rows[table] ?? [], error: null });
  return {
    from(table: string) {
      return {
        select(_c: string) {
          return {
            async eq(column: string, value: string) {
              calls.push({ table, kind: "eq", arg: column, value });
              return respond(table);
            },
            async or(filter: string) {
              calls.push({ table, kind: "or", arg: filter });
              return respond(table);
            },
          };
        },
      };
    },
  };
}

const subject = { user_id: "sub-1", email: "Sub@Example.com" };
const table = (doc: Awaited<ReturnType<typeof exportSubject>>, name: string) =>
  doc.tables.find((t) => t.table === name);

describe("DSAR exporter 1.3.0", () => {
  it("withholds credentials and staff notes", async () => {
    const doc = await exportSubject(
      makeAdmin({
        profiles: [{ id: "sub-1", full_name: "A", calendar_token: "secret-feed" }],
        push_tokens: [{ id: "p1", user_id: "sub-1", platform: "ios", token: "device-secret" }],
        background_checks: [{ id: "b1", user_id: "sub-1", status: "clear", raw: { v: 1 }, invite_url: "https://x/y" }],
        caregiver_stage_history: [{ id: "s1", caregiver_id: "sub-1", to_stage: "live", note: "staff opinion" }],
        account_deletion_jobs: [{ id: "d1", user_id: "sub-1", verification_token_hash: "abc" }],
      }),
      subject,
    );
    const first = (name: string) => (table(doc, name)?.rows?.[0] ?? {}) as Record<string, unknown>;
    assert.equal("calendar_token" in first("profiles"), false);
    assert.equal("token" in first("push_tokens"), false);
    assert.equal(first("push_tokens").platform, "ios");
    assert.equal("raw" in first("background_checks"), false);
    assert.equal("invite_url" in first("background_checks"), false);
    assert.equal(first("background_checks").status, "clear");
    assert.equal("note" in first("caregiver_stage_history"), false);
    assert.equal("verification_token_hash" in first("account_deletion_jobs"), false);
  });

  it("returns care-plan allergies and medications only for plans where the subject is the seeker", async () => {
    const calls: Call[] = [];
    const doc = await exportSubject(
      makeAdmin(
        {
          bookings: [
            { id: "bk-seeker", seeker_id: "sub-1", caregiver_id: "other" },
            { id: "bk-carer", seeker_id: "other", caregiver_id: "sub-1" },
          ],
          care_plans: [
            { id: "cp-seeker", booking_id: "bk-seeker" },
            { id: "cp-carer", booking_id: "bk-carer" },
          ],
          allergies: [{ id: "a1", care_plan_id: "cp-seeker", substance: "penicillin" }],
        },
        calls,
      ),
      subject,
    );
    const allergyCalls = calls.filter((c) => c.table === "allergies");
    assert.equal(allergyCalls.length, 1);
    assert.ok(allergyCalls[0].arg.includes("care_plan_id.eq.cp-seeker"));
    assert.ok(!allergyCalls[0].arg.includes("cp-carer"), "carer-side plans must not be used");
    assert.equal(table(doc, "allergies")?.row_count, 1);
  });

  it("does not query child tables when the subject has no parent rows", async () => {
    const calls: Call[] = [];
    const doc = await exportSubject(makeAdmin({}, calls), subject);
    assert.equal(calls.filter((c) => c.table === "medications").length, 0);
    assert.equal(table(doc, "medications")?.row_count, 0);
  });

  it("drops internal support notes and removes the flag column", async () => {
    const doc = await exportSubject(
      makeAdmin({
        support_tickets: [{ id: "t1", user_id: "sub-1", subject: "help" }],
        support_messages: [
          { id: "m1", ticket_id: "t1", body: "visible", internal_note: false },
          { id: "m2", ticket_id: "t1", body: "staff only", internal_note: true },
        ],
      }),
      subject,
    );
    const rows = (table(doc, "support_messages")?.rows ?? []) as Array<Record<string, unknown>>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].body, "visible");
    assert.equal("internal_note" in rows[0], false);
  });

  it("matches email-keyed tables on the verified email, in both cases", async () => {
    const calls: Call[] = [];
    await exportSubject(makeAdmin({}, calls), subject);
    const w = calls.find((c) => c.table === "waitlist");
    assert.ok(w, "waitlist must be queried");
    assert.ok(w.arg.includes("email.eq.Sub@Example.com"));
    assert.ok(w.arg.includes("email.eq.sub@example.com"));
    const lead = calls.find((c) => c.table === "employer_leads");
    assert.ok(lead?.arg.includes("work_email.eq."));
  });

  it("skips email-keyed tables, with a note, when the email cannot be matched safely", async () => {
    const calls: Call[] = [];
    const doc = await exportSubject(makeAdmin({}, calls), { user_id: "sub-1", email: "a,b@example.com" });
    assert.equal(calls.filter((c) => c.table === "waitlist").length, 0);
    assert.equal(table(doc, "waitlist")?.note, "email_not_matchable");
    assert.ok(doc.notes.some((n) => /email-keyed tables were skipped/.test(n)));
  });

  it("splits long booking id lists into several requests", async () => {
    const calls: Call[] = [];
    const bookings = Array.from({ length: 95 }, (_, i) => ({
      id: `bk-${i}`,
      seeker_id: "sub-1",
      caregiver_id: "other",
    }));
    await exportSubject(makeAdmin({ bookings }, calls), subject);
    const payCalls = calls.filter((c) => c.table === "payments");
    assert.equal(payCalls.length, 3, "95 ids at 40 per request is three requests");
    for (const c of payCalls) {
      assert.ok(c.arg.split(",").length <= 40);
    }
  });

  it("flags a table that hits the single-request row limit", async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: `n-${i}`, user_id: "sub-1" }));
    const doc = await exportSubject(makeAdmin({ notifications: many }), subject);
    assert.equal(table(doc, "notifications")?.note, "possibly_incomplete_row_limit");
    assert.ok(doc.notes.some((n) => n.includes("notifications")));
  });

  it("reports a failed child table as an error rather than silently empty", async () => {
    const admin: ExportAdminClient = {
      from(t: string) {
        return {
          select() {
            const res = () =>
              t === "support_messages"
                ? { data: null, error: { message: "column does not exist", code: "42703" } }
                : { data: t === "support_tickets" ? [{ id: "t1" }] : [], error: null };
            return { async eq() { return res(); }, async or() { return res(); } };
          },
        };
      },
    };
    const doc = await exportSubject(admin, subject);
    assert.match(table(doc, "support_messages")?.error ?? "", /column does not exist/);
  });
});
