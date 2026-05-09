"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RegShell from "../_components/RegShell";
import { Button, Input } from "../../../_components/ui";
import { JOB_TITLES, isFreeEmail } from "@/lib/org/types";

type Form = {
  full_name: string;
  work_email: string;
  phone: string;
  job_title: string;
  job_title_other: string;
  is_signatory: boolean;
};

const EMPTY: Form = {
  full_name: "",
  work_email: "",
  phone: "",
  job_title: "",
  job_title_other: "",
  is_signatory: true,
};

export default function Step5() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/org/me", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          me?: {
            full_name: string | null;
            work_email: string | null;
            phone: string | null;
            job_title: string | null;
            job_title_other: string | null;
            is_signatory: boolean;
          } | null;
        };
        if (cancelled || !json.me) return;
        setForm({
          full_name: json.me.full_name ?? "",
          work_email: json.me.work_email ?? "",
          phone: json.me.phone ?? "",
          job_title: json.me.job_title ?? "",
          job_title_other: json.me.job_title_other ?? "",
          is_signatory: !!json.me.is_signatory,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const free = form.work_email ? isFreeEmail(form.work_email) : false;
  const valid =
    form.full_name.length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.work_email) &&
    form.phone.length >= 5 &&
    form.job_title !== "" &&
    (!free || override);

  function update<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function next() {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/m/org/register/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "step5",
          ...form,
          free_email_override: override,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        free_email?: boolean;
        message?: string;
        error?: string;
      };
      if (json.free_email && !override) {
        setErr(
          json.message ??
            "That looks like a personal email. Use a work address or tick 'Continue anyway'.",
        );
        return;
      }
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? "Couldn't save.");
        return;
      }
      router.push("/m/org/register/step-6");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RegShell
      step={5}
      title="Your role"
      subtitle="The person handling this account today."
      back="/m/org/register/step-4"
    >
      <div className="space-y-3">
        <Input
          label="Full name *"
          value={form.full_name}
          onChange={(e) => update("full_name", e.target.value)}
        />
        <Input
          label="Work email *"
          type="email"
          value={form.work_email}
          onChange={(e) => {
            update("work_email", e.target.value.trim().toLowerCase());
            setOverride(false);
          }}
        />
        {free && (
          <div className="rounded-card bg-amber-50 border border-amber-200 p-3">
            <p className="text-[12px] text-amber-900">
              That looks like a personal email. Use a work address where
              possible — or tick the box to continue, and we&rsquo;ll do a
              stricter manual review.
            </p>
            <label className="mt-2 flex items-center gap-2 text-[12px] text-amber-900">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
              />
              Continue anyway
            </label>
          </div>
        )}
        <Input
          label="Work phone *"
          type="tel"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
        />
        <div>
          <p className="text-[13px] font-semibold text-heading mb-1">
            Job title *
          </p>
          <select
            value={form.job_title}
            onChange={(e) => update("job_title", e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-line text-[14px]"
          >
            <option value="">Select…</option>
            {JOB_TITLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {form.job_title === "Other" && (
          <Input
            label="Tell us your job title"
            value={form.job_title_other}
            onChange={(e) => update("job_title_other", e.target.value)}
          />
        )}
        <label className="flex items-center gap-2 text-[13px] text-heading">
          <input
            type="checkbox"
            checked={form.is_signatory}
            onChange={(e) => update("is_signatory", e.target.checked)}
          />
          I&rsquo;m the authorised signatory for this organisation
        </label>
        {!form.is_signatory && (
          <p className="text-[12px] text-subheading">
            Got it — we&rsquo;ll ask for the signatory&rsquo;s details during
            verification by email.
          </p>
        )}
      </div>
      {err && <p className="mt-3 text-[12px] text-rose-700">{err}</p>}
      <div className="mt-5">
        <Button block disabled={!valid || busy} onClick={next}>
          Continue
        </Button>
      </div>
    </RegShell>
  );
}
