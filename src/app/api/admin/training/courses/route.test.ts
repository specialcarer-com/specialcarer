/**
 * Route-level tests for POST /api/admin/training/courses.
 *
 * We test the pure _handleCreate handler with stubbed supabase + log deps,
 * avoiding the need to mock next/navigation (which the auth module requires
 * but the test env doesn't have). Matches the node:test pattern used by
 * src/lib/email/grace-period-blast.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleCreateCourse as _handleCreate } from "@/lib/admin/training-handlers";

type InsertCall = { table: string; row: Record<string, unknown> };

function makeClient(opts: {
  insertError?: { code?: string; message: string } | null;
  capturedInserts: InsertCall[];
}) {
  return {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          opts.capturedInserts.push({ table, row });
          return {
            select() {
              return {
                async single() {
                  if (opts.insertError) {
                    return { data: null, error: opts.insertError };
                  }
                  return {
                    data: {
                      id: "00000000-0000-0000-0000-000000000001",
                      slug: row.slug,
                      title: row.title,
                      published_at: row.published_at,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

const ADMIN = { id: "admin-1", email: "admin@example.com" };

const happyBody = {
  slug: "infection_control",
  title: "Infection Control",
  summary: "Hand hygiene and PPE.",
  category: "clinical",
  is_required: true,
  ceu_credits: 1.5,
  duration_minutes: 30,
  country_scope: "both",
  required_for_verticals: ["elderly_care"],
  sort_order: 50,
};

describe("POST /api/admin/training/courses (_handleCreate)", () => {
  it("happy path: 201 with course payload, defaults to draft", async () => {
    const captured: InsertCall[] = [];
    const client = makeClient({ capturedInserts: captured });
    const res = await _handleCreate({
      admin: ADMIN,
      client: client as unknown as Parameters<typeof _handleCreate>[0]["client"],
      logAction: async () => {},
      body: { ...happyBody },
    });
    assert.equal(res.status, 201);
    const json = (await res.json()) as { course: { slug: string } };
    assert.equal(json.course.slug, "infection_control");
    assert.equal(captured.length, 1);
    const row = captured[0].row;
    assert.equal(row.slug, "infection_control");
    assert.equal(row.category, "clinical");
    assert.match(String(row.published_at), /^9999-/);
  });

  it("publish_now=true sets published_at to now-ish", async () => {
    const captured: InsertCall[] = [];
    const client = makeClient({ capturedInserts: captured });
    const res = await _handleCreate({
      admin: ADMIN,
      client: client as unknown as Parameters<typeof _handleCreate>[0]["client"],
      logAction: async () => {},
      body: { ...happyBody, publish_now: true },
    });
    assert.equal(res.status, 201);
    const row = captured[0].row;
    const ts = new Date(String(row.published_at));
    const delta = Math.abs(Date.now() - ts.getTime());
    assert.ok(delta < 5000, "published_at should be ~now");
  });

  it("invalid slug → 400", async () => {
    const captured: InsertCall[] = [];
    const client = makeClient({ capturedInserts: captured });
    const res = await _handleCreate({
      admin: ADMIN,
      client: client as unknown as Parameters<typeof _handleCreate>[0]["client"],
      logAction: async () => {},
      body: { ...happyBody, slug: "Has Space!" },
    });
    assert.equal(res.status, 400);
    assert.equal(captured.length, 0);
  });

  it("invalid vertical → 400", async () => {
    const captured: InsertCall[] = [];
    const client = makeClient({ capturedInserts: captured });
    const res = await _handleCreate({
      admin: ADMIN,
      client: client as unknown as Parameters<typeof _handleCreate>[0]["client"],
      logAction: async () => {},
      body: { ...happyBody, required_for_verticals: ["intergalactic"] },
    });
    assert.equal(res.status, 400);
  });

  it("slug collision → 409", async () => {
    const captured: InsertCall[] = [];
    const client = makeClient({
      capturedInserts: captured,
      insertError: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "training_courses_slug_key"',
      },
    });
    const res = await _handleCreate({
      admin: ADMIN,
      client: client as unknown as Parameters<typeof _handleCreate>[0]["client"],
      logAction: async () => {},
      body: { ...happyBody },
    });
    assert.equal(res.status, 409);
    const json = (await res.json()) as { error: string };
    assert.match(json.error, /slug/i);
  });
});
