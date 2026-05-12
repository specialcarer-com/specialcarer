/**
 * Route-level tests for PUT /api/admin/training/courses/[id]/questions.
 * Tests the pure _handleReplaceQuestions handler with stubbed supabase
 * + log deps. Avoids requiring the auth module (which imports
 * next/navigation, unavailable in the node:test env).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleReplaceQuestions as _handleReplaceQuestions } from "@/lib/admin/training-handlers";

function makeClient(opts: {
  courseExists: boolean;
  capturedInserts: unknown[];
}) {
  return {
    from(table: string) {
      if (table === "training_courses") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: opts.courseExists ? { id: "course-1" } : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      return {
        delete() {
          return {
            async eq() {
              return { error: null };
            },
          };
        },
        async insert(rows: unknown) {
          opts.capturedInserts.push(rows);
          return { error: null };
        },
      };
    },
  };
}

const ADMIN = { id: "admin-1", email: "admin@example.com" };
const goodQuestion = {
  prompt: "What is 2+2?",
  options: ["3", "4", "5", "6"],
  correct_index: 1,
  explanation: "Basic.",
  sort_order: 1,
};

type Deps = Parameters<typeof _handleReplaceQuestions>[0];

describe("PUT /api/admin/training/courses/[id]/questions (_handleReplaceQuestions)", () => {
  it("happy path with 1 question → 200, row inserted", async () => {
    const captured: unknown[] = [];
    const client = makeClient({ courseExists: true, capturedInserts: captured });
    const res = await _handleReplaceQuestions({
      admin: ADMIN,
      client: client as unknown as Deps["client"],
      logAction: async () => {},
      courseId: "course-1",
      body: { questions: [goodQuestion] },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { ok: boolean; count: number };
    assert.equal(json.ok, true);
    assert.equal(json.count, 1);
    assert.equal(captured.length, 1);
  });

  it("3 options → 400 (4-option rule)", async () => {
    const captured: unknown[] = [];
    const client = makeClient({ courseExists: true, capturedInserts: captured });
    const res = await _handleReplaceQuestions({
      admin: ADMIN,
      client: client as unknown as Deps["client"],
      logAction: async () => {},
      courseId: "course-1",
      body: { questions: [{ ...goodQuestion, options: ["a", "b", "c"] }] },
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.match(json.error, /4 strings/);
    assert.equal(captured.length, 0);
  });

  it("5 options → 400 (4-option rule)", async () => {
    const captured: unknown[] = [];
    const client = makeClient({ courseExists: true, capturedInserts: captured });
    const res = await _handleReplaceQuestions({
      admin: ADMIN,
      client: client as unknown as Deps["client"],
      logAction: async () => {},
      courseId: "course-1",
      body: {
        questions: [{ ...goodQuestion, options: ["a", "b", "c", "d", "e"] }],
      },
    });
    assert.equal(res.status, 400);
  });

  it("correct_index out of range → 400", async () => {
    const captured: unknown[] = [];
    const client = makeClient({ courseExists: true, capturedInserts: captured });
    const res = await _handleReplaceQuestions({
      admin: ADMIN,
      client: client as unknown as Deps["client"],
      logAction: async () => {},
      courseId: "course-1",
      body: { questions: [{ ...goodQuestion, correct_index: 4 }] },
    });
    assert.equal(res.status, 400);
  });

  it("missing course → 404", async () => {
    const captured: unknown[] = [];
    const client = makeClient({
      courseExists: false,
      capturedInserts: captured,
    });
    const res = await _handleReplaceQuestions({
      admin: ADMIN,
      client: client as unknown as Deps["client"],
      logAction: async () => {},
      courseId: "missing",
      body: { questions: [goodQuestion] },
    });
    assert.equal(res.status, 404);
  });

  it("empty list → 200 with count=0", async () => {
    const captured: unknown[] = [];
    const client = makeClient({ courseExists: true, capturedInserts: captured });
    const res = await _handleReplaceQuestions({
      admin: ADMIN,
      client: client as unknown as Deps["client"],
      logAction: async () => {},
      courseId: "course-1",
      body: { questions: [] },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { count: number };
    assert.equal(json.count, 0);
    assert.equal(captured.length, 0);
  });
});
