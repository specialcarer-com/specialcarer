"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_LABEL,
  type TrainingCategory,
  type TrainingCountryScope,
  type TrainingEnrollment,
} from "@/lib/training/types";

type Course = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: TrainingCategory;
  is_required: boolean;
  ceu_credits: number;
  duration_minutes: number;
  country_scope: TrainingCountryScope;
};

type Row = Course & { enrollment: TrainingEnrollment | null };

export default function MobileTrainingHub() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ceu, setCeu] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"required" | "optional" | "completed">(
    "required",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRows([]);
        setErr("Sign in to access training.");
        return;
      }
      const [{ data: courses }, { data: enrollments }, { data: total }] =
        await Promise.all([
          supabase
            .from("training_courses")
            .select(
              "id, slug, title, summary, category, is_required, ceu_credits, duration_minutes, country_scope",
            )
            .order("sort_order", { ascending: true }),
          supabase
            .from("training_enrollments")
            .select(
              "id, carer_id, course_id, started_at, video_completed_at, quiz_passed_at, quiz_best_score, attempts, certificate_url, ceu_credits_awarded, verification_code",
            )
            .eq("carer_id", user.id),
          supabase
            .from("carer_ceu_totals_v")
            .select("total_credits")
            .eq("carer_id", user.id)
            .eq("year", new Date().getUTCFullYear())
            .maybeSingle(),
        ]);
      if (cancelled) return;
      const map = new Map(
        ((enrollments ?? []) as TrainingEnrollment[]).map((e) => [
          e.course_id,
          e,
        ]),
      );
      setRows(
        ((courses ?? []) as Course[]).map((c) => ({
          ...c,
          enrollment: map.get(c.id) ?? null,
        })),
      );
      setCeu(total ? Number(total.total_credits ?? 0) : 0);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows === null) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="Training & CEUs" back="/m/profile" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }

  const required = rows.filter(
    (r) => r.is_required && !r.enrollment?.quiz_passed_at,
  );
  const optional = rows.filter(
    (r) => !r.is_required && !r.enrollment?.quiz_passed_at,
  );
  const completed = rows.filter((r) => r.enrollment?.quiz_passed_at);

  const visible =
    tab === "required" ? required : tab === "optional" ? optional : completed;
  const counts = {
    required: required.length,
    optional: optional.length,
    completed: completed.length,
  };

  return (
    <div className="min-h-screen bg-bg-screen pb-12">
      <TopBar title="Training & CEUs" back="/m/profile" />
      <div className="px-5 pt-3 space-y-4">
        {err && <p className="text-[12px] text-rose-700">{err}</p>}

        <div className="rounded-card bg-white p-4 shadow-card">
          <p className="text-[12px] uppercase tracking-wide text-subheading">
            CEU credits this year
          </p>
          <p className="mt-1 text-[22px] font-bold text-heading">
            {ceu.toFixed(2)}
          </p>
          <p className="mt-0.5 text-[11px] text-subheading">
            Pass a course quiz with at least 80% to earn credits.
          </p>
        </div>

        <div className="flex gap-2 rounded-pill bg-white p-1 shadow-card">
          {(["required", "optional", "completed"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 rounded-pill py-2 text-[12.5px] font-semibold transition ${
                tab === k
                  ? "bg-primary text-white"
                  : "text-subheading"
              }`}
            >
              {k === "required"
                ? `Required (${counts.required})`
                : k === "optional"
                  ? `Optional (${counts.optional})`
                  : `Done (${counts.completed})`}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="rounded-card bg-white p-5 text-center text-[13px] text-subheading shadow-card">
            {tab === "completed"
              ? "No completed courses yet."
              : "Nothing here right now."}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((r) => {
              const passed = !!r.enrollment?.quiz_passed_at;
              const inProgress =
                !passed && !!r.enrollment?.video_completed_at;
              return (
                <li key={r.id}>
                  <Link
                    href={`/m/training/${r.slug}`}
                    className="block rounded-card bg-white p-4 shadow-card active:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-bold text-heading">
                          {r.title}
                        </p>
                        <p className="mt-0.5 text-[12px] text-subheading">
                          {r.summary}
                        </p>
                        <p className="mt-2 text-[11px] text-subheading">
                          {CATEGORY_LABEL[r.category]} · {r.duration_minutes} min
                          · {Number(r.ceu_credits).toFixed(2)} CEU
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
                          passed
                            ? "bg-status-completed text-[#2C7A3F]"
                            : inProgress
                              ? "bg-amber-100 text-amber-800"
                              : "bg-muted text-subheading"
                        }`}
                      >
                        {passed
                          ? "Passed"
                          : inProgress
                            ? "Quiz pending"
                            : "Start"}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href="/m/training/certificates"
          className="block text-center text-[13px] font-semibold text-primary py-2"
        >
          View my certificates →
        </Link>
      </div>
    </div>
  );
}
