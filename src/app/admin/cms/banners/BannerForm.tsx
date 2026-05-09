"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CMS_BANNER_PLACEMENTS } from "@/lib/admin-ops/types";

type Initial = {
  id?: string;
  key: string;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  audience: string[];
  placement: string;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  dismissible: boolean;
};

export default function BannerForm({
  initial,
  inline,
}: {
  initial?: Initial;
  inline?: boolean;
}) {
  const router = useRouter();
  const [key, setKey] = useState(initial?.key ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(initial?.cta_label ?? "");
  const [ctaHref, setCtaHref] = useState(initial?.cta_href ?? "");
  const [placement, setPlacement] = useState(initial?.placement ?? "home_top");
  const [audience, setAudience] = useState(
    (initial?.audience ?? []).join(", "),
  );
  const [active, setActive] = useState(initial?.active ?? false);
  const [dismissible, setDismissible] = useState(
    initial?.dismissible ?? true,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        key,
        title,
        body: body || null,
        cta_label: ctaLabel || null,
        cta_href: ctaHref || null,
        placement,
        audience: audience
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        active,
        dismissible,
      };
      const url = initial?.id
        ? `/api/admin/cms/banners/${initial.id}`
        : "/api/admin/cms/banners";
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
      router.refresh();
      if (!inline) router.push("/admin/cms/banners");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">
        {initial?.id ? "Edit banner" : "New banner"}
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Key
          </span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={!!initial?.id}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Placement
          </span>
          <select
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {CMS_BANNER_PLACEMENTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs">
        <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Title
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-xs">
        <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Body
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            CTA label
          </span>
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            CTA href
          </span>
          <input
            value={ctaHref}
            onChange={(e) => setCtaHref(e.target.value)}
            placeholder="/blog/foo"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-xs">
        <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Audience (csv: UK, US, family, carer, org, all)
        </span>
        <input
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <div className="flex items-center gap-4 text-xs">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={dismissible}
            onChange={(e) => setDismissible(e.target.checked)}
          />
          Dismissible
        </label>
      </div>

      {/* Live preview */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">
          Preview
        </p>
        {(title || body) ? (
          <div className="rounded-md bg-teal-50 border border-teal-100 px-3 py-2 text-sm flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-teal-900">{title}</p>
              {body && (
                <p className="text-xs text-teal-800 mt-0.5">{body}</p>
              )}
            </div>
            {ctaLabel && (
              <span className="shrink-0 text-xs font-semibold text-teal-700">
                {ctaLabel} →
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs italic text-slate-400">
            Title / body will preview here.
          </p>
        )}
      </div>

      {err && (
        <p aria-live="polite" className="text-sm text-rose-700">
          {err}
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={busy || !title || !key}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : initial?.id ? "Save changes" : "Create banner"}
        </button>
      </div>
    </div>
  );
}
