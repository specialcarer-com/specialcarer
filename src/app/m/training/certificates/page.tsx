"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar } from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  course_id: string;
  quiz_passed_at: string;
  ceu_credits_awarded: number;
  verification_code: string | null;
};

type Course = { id: string; slug: string; title: string };

export default function MobileCertificatesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [courseById, setCourseById] = useState<Map<string, Course>>(new Map());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRows([]);
        setErr("Sign in to view certificates.");
        return;
      }
      const { data: enrollments } = await supabase
        .from("training_enrollments")
        .select(
          "id, course_id, quiz_passed_at, ceu_credits_awarded, verification_code",
        )
        .eq("carer_id", user.id)
        .not("quiz_passed_at", "is", null)
        .order("quiz_passed_at", { ascending: false });
      if (cancelled) return;
      const list = (enrollments ?? []) as Row[];
      setRows(list);
      if (list.length > 0) {
        const { data: courses } = await supabase
          .from("training_courses")
          .select("id, slug, title")
          .in(
            "id",
            list.map((r) => r.course_id),
          );
        if (!cancelled) {
          setCourseById(
            new Map(
              ((courses ?? []) as Course[]).map((c) => [c.id, c]),
            ),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows === null) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="My certificates" back="/m/training" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }

  const total = rows.reduce(
    (acc, r) => acc + Number(r.ceu_credits_awarded ?? 0),
    0,
  );

  return (
    <div className="min-h-screen bg-bg-screen pb-12">
      <TopBar title="My certificates" back="/m/training" />
      <div className="px-5 pt-3 space-y-4">
        {err && <p className="text-[12px] text-rose-700">{err}</p>}

        <div className="rounded-card bg-white p-4 shadow-card">
          <p className="text-[12px] uppercase tracking-wide text-subheading">
            Total CEU credits
          </p>
          <p className="mt-1 text-[22px] font-bold text-heading">
            {total.toFixed(2)}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-card bg-white p-5 text-center text-[13px] text-subheading shadow-card">
            No certificates yet.{" "}
            <Link href="/m/training" className="text-primary font-semibold">
              Browse training
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const c = courseById.get(r.course_id);
              return (
                <li key={r.id} className="rounded-card bg-white p-4 shadow-card">
                  <p className="text-[14px] font-bold text-heading">
                    {c?.title ?? "Course"}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-subheading">
                    Passed{" "}
                    {new Date(r.quiz_passed_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {Number(r.ceu_credits_awarded).toFixed(2)} CEU
                    {r.verification_code && ` · ${r.verification_code}`}
                  </p>
                  {c?.slug && (
                    <a
                      href={`/api/training/${c.slug}/certificate`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex h-9 items-center rounded-pill bg-primary-50 px-4 text-[13px] font-semibold text-primary"
                    >
                      Download
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
