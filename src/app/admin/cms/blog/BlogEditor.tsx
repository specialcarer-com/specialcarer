"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initial?: {
    id?: string;
    slug: string;
    title: string;
    excerpt: string | null;
    body_md: string;
    hero_image_url: string | null;
    status: string;
    audience: string[];
    tags: string[];
  };
};

export default function BlogEditor({ initial }: Props) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [body, setBody] = useState(initial?.body_md ?? "");
  const [heroUrl, setHeroUrl] = useState(initial?.hero_image_url ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [audience, setAudience] = useState(
    (initial?.audience ?? []).join(", "),
  );
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function csvToArr(s: string): string[] {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        slug,
        title,
        excerpt,
        body_md: body,
        hero_image_url: heroUrl || null,
        status,
        audience: csvToArr(audience),
        tags: csvToArr(tags),
      };
      const url = initial?.id
        ? `/api/admin/cms/posts/${initial.id}`
        : "/api/admin/cms/posts";
      const method = initial?.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      router.push("/admin/cms/blog");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Slug
          </span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-xs">
        <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Excerpt
        </span>
        <input
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          maxLength={500}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${
                tab === t
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        {tab === "write" ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            className="w-full rounded-b-2xl border-0 px-3 py-2 text-sm font-mono"
            placeholder="Markdown body…"
          />
        ) : (
          <div className="p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {body || (
              <span className="text-slate-400 italic">
                Nothing to preview yet.
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Hero image URL
          </span>
          <input
            value={heroUrl}
            onChange={(e) => setHeroUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Audience (csv)
          </span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="UK, US, families, carers"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-xs">
        <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Tags (csv)
        </span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="release, admin, news"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      {err && (
        <p aria-live="polite" className="text-sm text-rose-700">
          {err}
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={busy || !slug.trim() || !title.trim()}
          className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : initial?.id ? "Save changes" : "Create post"}
        </button>
      </div>
    </div>
  );
}
