import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { INTERVIEW_PROMPTS } from "@/lib/vetting/types";
import InterviewRowActions from "./InterviewRowActions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  carer_id: string;
  prompt_index: number;
  video_path: string;
  duration_seconds: number | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  signed_url?: string | null;
};

export default async function InterviewsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = sp.filter ?? "pending";
  const admin = createAdminClient();
  let q = admin
    .from("carer_interview_submissions")
    .select(
      "id, carer_id, prompt_index, video_path, duration_seconds, status, rejection_reason, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") q = q.eq("status", filter);
  const { data } = await q;
  const baseRows = (data ?? []) as Row[];

  const rows: Row[] = await Promise.all(
    baseRows.map(async (r) => {
      const { data: signed } = await admin.storage
        .from("interview-videos")
        .createSignedUrl(r.video_path, 3600);
      return { ...r, signed_url: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Carer video interviews
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Watch each clip and approve or reject. Carers see the verdict
            on their dashboard.
          </p>
        </div>
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; safety
        </Link>
      </div>

      <div className="flex gap-2 text-xs">
        {["pending", "approved", "rejected", "all"].map((f) => (
          <Link
            key={f}
            href={`/admin/trust-safety/interviews?filter=${f}`}
            className={`px-3 py-1.5 rounded-full border ${
              filter === f
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {f}
          </Link>
        ))}
      </div>

      <ul className="space-y-3">
        {rows.length === 0 && (
          <li className="text-sm text-slate-500">Nothing in this queue.</li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  Prompt {r.prompt_index + 1}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    · carer {r.carer_id.slice(0, 8)}…
                  </span>
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {INTERVIEW_PROMPTS[r.prompt_index]}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {r.duration_seconds ? `${r.duration_seconds}s · ` : ""}
                  {new Date(r.created_at).toLocaleString("en-GB")}
                </p>
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full border bg-slate-50 border-slate-200 font-semibold">
                {r.status}
              </span>
            </div>
            {r.signed_url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={r.signed_url}
                controls
                className="w-full rounded-lg max-h-96"
              />
            )}
            {r.status === "pending" && (
              <InterviewRowActions id={r.id} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
