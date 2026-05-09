import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FORUM_REPORT_REASON_LABEL,
  FORUM_REPORT_STATUSES,
  type ForumReportReason,
  type ForumReportStatus,
} from "@/lib/community/types";
import ForumReportRowActions from "./ForumReportRowActions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  reporter_user_id: string;
  thread_id: string | null;
  post_id: string | null;
  reason: ForumReportReason;
  description: string;
  status: ForumReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

const TONE: Record<string, string> = {
  open: "bg-amber-50 text-amber-800 border-amber-200",
  actioned: "bg-rose-50 text-rose-800 border-rose-200",
  dismissed: "bg-slate-100 text-slate-700 border-slate-200",
};

export default async function AdminForumReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "open";

  const admin = createAdminClient();
  let q = admin
    .from("forum_reports")
    .select(
      "id, reporter_user_id, thread_id, post_id, reason, description, status, resolved_by, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (
    status !== "all" &&
    (FORUM_REPORT_STATUSES as readonly string[]).includes(status)
  ) {
    q = q.eq("status", status);
  }
  const { data } = await q;
  const list = (data ?? []) as Row[];

  // Resolve thread + post snippets in one shot.
  const threadIds = Array.from(
    new Set(list.map((r) => r.thread_id).filter((x): x is string => !!x)),
  );
  const postIds = Array.from(
    new Set(list.map((r) => r.post_id).filter((x): x is string => !!x)),
  );
  const [{ data: threads }, { data: posts }] = await Promise.all([
    threadIds.length
      ? admin
          .from("forum_threads")
          .select("id, title, is_deleted, is_locked")
          .in("id", threadIds)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? admin
          .from("forum_posts")
          .select("id, thread_id, body_md, is_deleted")
          .in("id", postIds)
      : Promise.resolve({ data: [] }),
  ]);
  const threadById = new Map(
    (threads ?? []).map((t) => [
      t.id as string,
      t as { id: string; title: string; is_deleted: boolean; is_locked: boolean },
    ]),
  );
  const postById = new Map(
    (posts ?? []).map((p) => [
      p.id as string,
      p as { id: string; thread_id: string; body_md: string; is_deleted: boolean },
    ]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Community reports
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Carer-flagged threads and replies. Soft-delete the offending content,
          lock heated threads, or dismiss noise.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["open", "actioned", "dismissed", "all"] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/trust-safety/forum-reports?status=${s}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              status === s
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No community reports in this filter.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => {
            const thread = r.thread_id ? threadById.get(r.thread_id) : null;
            const post = r.post_id ? postById.get(r.post_id) : null;
            return (
              <li
                key={r.id}
                className="rounded-2xl bg-white border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {FORUM_REPORT_REASON_LABEL[r.reason]}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(r.created_at).toLocaleString("en-GB")} ·
                      Reporter {r.reporter_user_id.slice(0, 8)}
                    </p>
                    {thread && (
                      <p className="mt-2 text-sm">
                        <span className="text-xs text-slate-500">Thread:</span>{" "}
                        <Link
                          href={`/dashboard/community/${thread.id}`}
                          className="text-teal-700 hover:underline font-semibold"
                        >
                          {thread.title}
                        </Link>
                        {thread.is_deleted && (
                          <span className="ml-2 text-xs text-rose-700">
                            (deleted)
                          </span>
                        )}
                        {thread.is_locked && (
                          <span className="ml-2 text-xs text-amber-700">
                            (locked)
                          </span>
                        )}
                      </p>
                    )}
                    {post && (
                      <p className="mt-2 text-sm">
                        <span className="text-xs text-slate-500">Reply:</span>{" "}
                        <Link
                          href={`/dashboard/community/${post.thread_id}`}
                          className="text-teal-700 hover:underline"
                        >
                          {post.body_md.slice(0, 120)}…
                        </Link>
                        {post.is_deleted && (
                          <span className="ml-2 text-xs text-rose-700">
                            (deleted)
                          </span>
                        )}
                      </p>
                    )}
                    {r.description && (
                      <p className="mt-2 text-xs text-slate-700 whitespace-pre-wrap">
                        {r.description}
                      </p>
                    )}
                    {r.status === "open" && (
                      <ForumReportRowActions
                        reportId={r.id}
                        hasThread={!!r.thread_id}
                        hasPost={!!r.post_id}
                      />
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[11px] px-2 py-1 rounded-full border font-semibold ${TONE[r.status] ?? TONE.open}`}
                  >
                    {r.status}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pt-4">
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; Safety
        </Link>
      </div>
    </div>
  );
}
