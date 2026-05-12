"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TRAINING_CATEGORIES,
  TRAINING_COUNTRY_SCOPES,
  TRAINING_VERTICALS,
  TRAINING_VIDEO_PROVIDERS,
  type TrainingCategory,
  type TrainingCountryScope,
  type TrainingVertical,
  type TrainingVideoProvider,
} from "@/lib/admin/training-validation";

const BRAND_TEAL = "#0E7C7B";
const BRAND_ACCENT = "#F4A261";

export type CourseFormValues = {
  slug: string;
  title: string;
  summary: string;
  category: TrainingCategory;
  is_required: boolean;
  ceu_credits: number;
  video_url: string;
  video_provider: TrainingVideoProvider;
  transcript_md: string;
  duration_minutes: number;
  country_scope: TrainingCountryScope;
  required_for_verticals: TrainingVertical[];
  sort_order: number;
};

export type QuestionFormValue = {
  prompt: string;
  options: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation: string;
};

export const EMPTY_QUESTION: QuestionFormValue = {
  prompt: "",
  options: ["", "", "", ""],
  correct_index: 0,
  explanation: "",
};

export const DEFAULT_VALUES: CourseFormValues = {
  slug: "",
  title: "",
  summary: "",
  category: "clinical",
  is_required: false,
  ceu_credits: 1,
  video_url: "",
  video_provider: "embed",
  transcript_md: "",
  duration_minutes: 30,
  country_scope: "both",
  required_for_verticals: [],
  sort_order: 100,
};

type Props = {
  mode: "create" | "edit";
  courseId?: string;
  initialCourse: CourseFormValues;
  initialQuestions: QuestionFormValue[];
  initialPublishedAt: string | null;
};

const labelCls = "block text-xs font-semibold text-slate-700 mb-1";
const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400";

function isCurrentlyPublished(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  return new Date(publishedAt) <= new Date();
}

export default function CourseForm({
  mode,
  courseId,
  initialCourse,
  initialQuestions,
  initialPublishedAt,
}: Props) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseFormValues>(initialCourse);
  const [questions, setQuestions] = useState<QuestionFormValue[]>(
    initialQuestions.length > 0 ? initialQuestions : [{ ...EMPTY_QUESTION }],
  );
  const [publishedAt, setPublishedAt] = useState<string | null>(
    initialPublishedAt,
  );
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const published = isCurrentlyPublished(publishedAt);

  function updateCourse<K extends keyof CourseFormValues>(
    key: K,
    value: CourseFormValues[K],
  ) {
    setCourse((c) => ({ ...c, [key]: value }));
  }

  function toggleVertical(v: TrainingVertical) {
    setCourse((c) => ({
      ...c,
      required_for_verticals: c.required_for_verticals.includes(v)
        ? c.required_for_verticals.filter((x) => x !== v)
        : [...c.required_for_verticals, v],
    }));
  }

  function addQuestion() {
    setQuestions((q) => [...q, { ...EMPTY_QUESTION, options: ["", "", "", ""] }]);
  }

  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i));
  }

  function moveQuestion(i: number, dir: -1 | 1) {
    setQuestions((q) => {
      const j = i + dir;
      if (j < 0 || j >= q.length) return q;
      const next = [...q];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function updateQuestion(i: number, patch: Partial<QuestionFormValue>) {
    setQuestions((q) =>
      q.map((item, idx) => (idx === i ? { ...item, ...patch } : item)),
    );
  }

  function updateOption(i: number, optIdx: 0 | 1 | 2 | 3, value: string) {
    setQuestions((q) =>
      q.map((item, idx) => {
        if (idx !== i) return item;
        const opts = [...item.options] as [string, string, string, string];
        opts[optIdx] = value;
        return { ...item, options: opts };
      }),
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...course,
        ceu_credits: Number(course.ceu_credits),
        duration_minutes: Number(course.duration_minutes),
        sort_order: Number(course.sort_order),
        video_url: course.video_url.trim() === "" ? null : course.video_url,
        transcript_md:
          course.transcript_md.trim() === "" ? null : course.transcript_md,
      };

      let targetId = courseId;
      if (mode === "create") {
        const res = await fetch("/api/admin/training/courses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as {
          course?: { id: string };
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        targetId = json.course?.id;
      } else {
        const res = await fetch(`/api/admin/training/courses/${courseId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
      }

      // Save questions (skip if all-empty in create mode and user added nothing real).
      const realQuestions = questions.filter(
        (q) =>
          q.prompt.trim() !== "" ||
          q.options.some((o) => o.trim() !== ""),
      );
      if (targetId) {
        const qres = await fetch(
          `/api/admin/training/courses/${targetId}/questions`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              questions: realQuestions.map((q, idx) => ({
                prompt: q.prompt,
                options: q.options,
                correct_index: q.correct_index,
                explanation: q.explanation || null,
                sort_order: idx + 1,
              })),
            }),
          },
        );
        const qjson = (await qres.json()) as { error?: string };
        if (!qres.ok) {
          throw new Error(qjson.error ?? `Questions HTTP ${qres.status}`);
        }
      }

      if (mode === "create" && targetId) {
        router.push(`/admin/training/${targetId}/edit`);
      } else {
        setMessage({ kind: "ok", text: "Saved." });
        router.refresh();
      }
    } catch (err) {
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishToggle() {
    if (!courseId) return;
    setPublishing(true);
    setMessage(null);
    try {
      const url = published
        ? `/api/admin/training/courses/${courseId}/unpublish`
        : `/api/admin/training/courses/${courseId}/publish`;
      const res = await fetch(url, { method: "POST" });
      const json = (await res.json()) as {
        course?: { published_at: string | null };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setPublishedAt(json.course?.published_at ?? null);
      setMessage({
        kind: "ok",
        text: published ? "Course unpublished." : "Course published.",
      });
    } catch (err) {
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : "Publish toggle failed",
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleDraftQuiz() {
    if (!courseId) return;
    setDrafting(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/training/courses/${courseId}/draft-quiz`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ count: 5 }),
        },
      );
      const json = (await res.json()) as {
        questions?: QuestionFormValue[];
        error?: string;
        message?: string;
      };
      if (res.status === 501) {
        setMessage({
          kind: "err",
          text: json.message ?? "AI drafting unavailable.",
        });
        return;
      }
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      if (Array.isArray(json.questions)) {
        setQuestions(json.questions);
        setMessage({ kind: "ok", text: "Draft questions loaded." });
      }
    } catch (err) {
      setMessage({
        kind: "err",
        text: err instanceof Error ? err.message : "Draft failed",
      });
    } finally {
      setDrafting(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="space-y-6"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {mode === "create" ? "Add new course" : "Edit course"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === "create"
              ? "New courses are saved as drafts. Publish once the quiz is ready."
              : "Update course fields and the question bank, then save."}
          </p>
        </div>
        {mode === "edit" && courseId ? (
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-medium text-white"
              style={{
                backgroundColor: published ? BRAND_TEAL : BRAND_ACCENT,
              }}
            >
              {published ? "Published" : "Draft"}
            </span>
            <button
              type="button"
              disabled={publishing}
              onClick={handlePublishToggle}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {publishing
                ? "…"
                : published
                  ? "Unpublish"
                  : "Publish"}
            </button>
          </div>
        ) : null}
      </div>

      {message ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {/* ── Course fields ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Course details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Slug</label>
            <input
              required
              className={inputCls}
              value={course.slug}
              onChange={(e) => updateCourse("slug", e.target.value)}
              placeholder="e.g. medication_administration"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Lowercase, letters/digits/_/-, max 80.
            </p>
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input
              required
              className={inputCls}
              value={course.title}
              onChange={(e) => updateCourse("title", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Summary</label>
            <textarea
              required
              rows={2}
              className={inputCls}
              value={course.summary}
              onChange={(e) => updateCourse("summary", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select
              className={inputCls}
              value={course.category}
              onChange={(e) =>
                updateCourse("category", e.target.value as TrainingCategory)
              }
            >
              {TRAINING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Country scope</label>
            <select
              className={inputCls}
              value={course.country_scope}
              onChange={(e) =>
                updateCourse(
                  "country_scope",
                  e.target.value as TrainingCountryScope,
                )
              }
            >
              {TRAINING_COUNTRY_SCOPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>CEU credits</label>
            <input
              type="number"
              step="0.25"
              min="0.25"
              className={inputCls}
              value={course.ceu_credits}
              onChange={(e) =>
                updateCourse("ceu_credits", Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className={labelCls}>Duration (minutes)</label>
            <input
              type="number"
              min="1"
              className={inputCls}
              value={course.duration_minutes}
              onChange={(e) =>
                updateCourse("duration_minutes", Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className={labelCls}>Sort order</label>
            <input
              type="number"
              className={inputCls}
              value={course.sort_order}
              onChange={(e) =>
                updateCourse("sort_order", Number(e.target.value))
              }
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="is_required"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={course.is_required}
              onChange={(e) => updateCourse("is_required", e.target.checked)}
            />
            <label htmlFor="is_required" className="text-sm text-slate-700">
              Required (mandatory)
            </label>
          </div>
        </div>

        <div>
          <label className={labelCls}>Required for verticals</label>
          <div className="flex flex-wrap gap-2">
            {TRAINING_VERTICALS.map((v) => {
              const on = course.required_for_verticals.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleVertical(v)}
                  className="rounded-full px-3 py-1 text-xs font-medium border"
                  style={
                    on
                      ? {
                          backgroundColor: BRAND_TEAL,
                          borderColor: BRAND_TEAL,
                          color: "white",
                        }
                      : { borderColor: "#cbd5e1", color: "#475569" }
                  }
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Video + transcript ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">
          Video & transcript
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>Video URL</label>
            <input
              type="url"
              className={inputCls}
              value={course.video_url}
              onChange={(e) => updateCourse("video_url", e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className={labelCls}>Provider</label>
            <select
              className={inputCls}
              value={course.video_provider}
              onChange={(e) =>
                updateCourse(
                  "video_provider",
                  e.target.value as TrainingVideoProvider,
                )
              }
            >
              {TRAINING_VIDEO_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Transcript (Markdown)</label>
          <textarea
            rows={10}
            className={`${inputCls} font-mono text-xs`}
            value={course.transcript_md}
            onChange={(e) => updateCourse("transcript_md", e.target.value)}
            placeholder="# Title&#10;&#10;Course content in Markdown..."
          />
        </div>
      </section>

      {/* ── Quiz questions ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">
            Quiz questions ({questions.length})
          </h2>
          <div className="flex items-center gap-2">
            {mode === "edit" && courseId ? (
              <button
                type="button"
                disabled={drafting}
                onClick={handleDraftQuiz}
                className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{
                  borderColor: BRAND_ACCENT,
                  color: BRAND_ACCENT,
                }}
              >
                {drafting ? "Drafting…" : "✨ Draft from transcript"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={addQuestion}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              + Add question
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((q, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Q{i + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveQuestion(i, -1)}
                    disabled={i === 0}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(i, 1)}
                    disabled={i === questions.length - 1}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Prompt</label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={q.prompt}
                  onChange={(e) =>
                    updateQuestion(i, { prompt: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {([0, 1, 2, 3] as const).map((optIdx) => (
                  <label
                    key={optIdx}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1"
                  >
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correct_index === optIdx}
                      onChange={() =>
                        updateQuestion(i, { correct_index: optIdx })
                      }
                    />
                    <input
                      className="flex-1 text-sm focus:outline-none"
                      value={q.options[optIdx]}
                      onChange={(e) =>
                        updateOption(i, optIdx, e.target.value)
                      }
                      placeholder={`Option ${optIdx + 1}`}
                    />
                  </label>
                ))}
              </div>
              <div>
                <label className={labelCls}>Explanation (optional)</label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={q.explanation}
                  onChange={(e) =>
                    updateQuestion(i, { explanation: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-95 disabled:opacity-50"
          style={{ backgroundColor: BRAND_TEAL }}
        >
          {saving ? "Saving…" : mode === "create" ? "Create course" : "Save"}
        </button>
      </div>
    </form>
  );
}
