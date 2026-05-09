"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar, Button } from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_LABEL, type TrainingCategory } from "@/lib/training/types";

type Course = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: TrainingCategory;
  ceu_credits: number;
  video_url: string | null;
  transcript_md: string | null;
  duration_minutes: number;
};

type Enrollment = {
  video_completed_at: string | null;
  quiz_passed_at: string | null;
};

export default function MobileCourseDetail() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const supabase = createClient();
  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: c } = await supabase
        .from("training_courses")
        .select(
          "id, slug, title, summary, category, ceu_credits, video_url, transcript_md, duration_minutes",
        )
        .eq("slug", slug)
        .maybeSingle<Course>();
      if (cancelled) return;
      if (!c) {
        setLoaded(true);
        setErr("Course not found.");
        return;
      }
      setCourse(c);
      if (user) {
        const { data: e } = await supabase
          .from("training_enrollments")
          .select("video_completed_at, quiz_passed_at")
          .eq("carer_id", user.id)
          .eq("course_id", c.id)
          .maybeSingle<Enrollment>();
        if (!cancelled) setEnrollment(e ?? null);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function markWatched() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/training/${slug}/video-complete`, {
        method: "POST",
      });
      if (!res.ok) {
        setErr("Could not mark watched. Try again.");
        return;
      }
      setEnrollment((prev) => ({
        video_completed_at: new Date().toISOString(),
        quiz_passed_at: prev?.quiz_passed_at ?? null,
      }));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-bg-screen pb-32">
        <TopBar title="Training" back="/m/training" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }
  if (!course) {
    return (
      <div className="min-h-screen bg-bg-screen pb-32">
        <TopBar title="Training" back="/m/training" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          {err ?? "Course not found."}
        </p>
      </div>
    );
  }

  const watched = !!enrollment?.video_completed_at;
  const passed = !!enrollment?.quiz_passed_at;

  return (
    <div className="min-h-screen bg-bg-screen pb-32">
      <TopBar title={course.title} back="/m/training" />

      <div className="px-5 pt-3 space-y-4">
        <p className="text-[12px] text-subheading">
          {CATEGORY_LABEL[course.category]} · {course.duration_minutes} min ·{" "}
          {Number(course.ceu_credits).toFixed(2)} CEU
        </p>
        <p className="text-[13px] text-heading">{course.summary}</p>

        {course.video_url && (
          <div
            className="relative w-full overflow-hidden rounded-card bg-black"
            style={{ paddingBottom: "56.25%" }}
          >
            <iframe
              src={course.video_url}
              title={course.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
        )}

        {course.transcript_md && (
          <div className="rounded-card bg-white p-4 shadow-card">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subheading">
              Transcript
            </p>
            <div className="text-[13px] text-heading whitespace-pre-wrap leading-relaxed">
              {course.transcript_md}
            </div>
          </div>
        )}

        {err && <p className="text-[12px] text-rose-700">{err}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        {passed ? (
          <div className="flex gap-2">
            <a
              href={`/api/training/${slug}/certificate`}
              target="_blank"
              rel="noreferrer"
              className="flex-1"
            >
              <Button block>Download certificate</Button>
            </a>
            <Button
              variant="outline"
              onClick={() => router.push(`/m/training/${slug}/quiz`)}
            >
              Retake
            </Button>
          </div>
        ) : !watched ? (
          <Button block disabled={busy} onClick={markWatched}>
            {busy ? "Saving…" : "Mark video watched"}
          </Button>
        ) : (
          <Button block onClick={() => router.push(`/m/training/${slug}/quiz`)}>
            Take quiz
          </Button>
        )}
      </div>

      {!enrollment && (
        <div className="px-5 mt-2 text-center">
          <Link
            href="/m/login"
            className="text-[12px] text-subheading underline"
          >
            Sign in to track progress
          </Link>
        </div>
      )}
    </div>
  );
}
