import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "My certificates — SpecialCarer" };

type Row = {
  id: string;
  course_id: string;
  quiz_passed_at: string;
  ceu_credits_awarded: number;
  verification_code: string | null;
};

type Course = { id: string; slug: string; title: string };

export default async function CertificatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/training/certificates");

  const { data: enrollments } = await supabase
    .from("training_enrollments")
    .select(
      "id, course_id, quiz_passed_at, ceu_credits_awarded, verification_code",
    )
    .eq("carer_id", user.id)
    .not("quiz_passed_at", "is", null)
    .order("quiz_passed_at", { ascending: false });

  const list = (enrollments ?? []) as Row[];
  const courseIds = list.map((r) => r.course_id);
  const { data: courses } = courseIds.length
    ? await supabase
        .from("training_courses")
        .select("id, slug, title")
        .in("id", courseIds)
    : { data: [] };
  const courseById = new Map(
    ((courses ?? []) as Course[]).map((c) => [c.id, c]),
  );

  const total = list.reduce(
    (acc, r) => acc + Number(r.ceu_credits_awarded ?? 0),
    0,
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">My certificates</h1>
        <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 border border-teal-100 text-teal-800 px-3 py-1 text-sm font-semibold">
          {total.toFixed(2)} CEU credits total
        </span>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No certificates yet — pass a course quiz to earn your first.{" "}
          <Link
            href="/dashboard/training"
            className="font-semibold text-slate-900 underline"
          >
            Browse training
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => {
            const c = courseById.get(r.course_id);
            return (
              <li
                key={r.id}
                className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {c?.title ?? "Course"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Passed{" "}
                    {new Date(r.quiz_passed_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {Number(r.ceu_credits_awarded).toFixed(2)} CEU
                    {r.verification_code && ` · code ${r.verification_code}`}
                  </p>
                </div>
                {c?.slug && (
                  <a
                    href={`/api/training/${c.slug}/certificate`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
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
  );
}
