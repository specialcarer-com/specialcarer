"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar, Button, TextArea } from "../../../_components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  SAFETY_REPORT_TYPES,
  SAFETY_REPORT_TYPE_LABEL,
  SAFETY_SEVERITIES,
  SAFETY_SEVERITY_LABEL,
  type SafetyReportType,
  type SafetySeverity,
} from "@/lib/safety/types";

export default function ReportIssuePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookingId = params?.id ?? "";
  const supabase = createClient();
  const [subjectUserId, setSubjectUserId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<SafetyReportType>("verbal_abuse");
  const [severity, setSeverity] = useState<SafetySeverity>("medium");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/m/login?redirect=/m/booking/${bookingId}/report-issue`);
        return;
      }
      // Pre-fill: the seeker on the booking is the subject the carer is
      // reporting. If the caller isn't the carer on the booking, leave
      // subject null and let the API decide.
      const { data: booking } = await supabase
        .from("bookings")
        .select("seeker_id, caregiver_id")
        .eq("id", bookingId)
        .maybeSingle<{ seeker_id: string; caregiver_id: string | null }>();
      if (cancelled) return;
      if (booking && booking.caregiver_id === user.id) {
        setSubjectUserId(booking.seeker_id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const ok = description.trim().length >= 10 && description.trim().length <= 5000;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/safety/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          subjectUserId,
          reportType,
          severity,
          description: description.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(
          (json as { message?: string; error?: string })?.message ??
            (json as { error?: string })?.error ??
            "Could not file report.",
        );
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="Report filed" back="/m/support" />
        <div className="px-5 pt-4 space-y-4">
          <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[14px] font-bold text-emerald-900">
              Report filed.
            </p>
            <p className="mt-1 text-[13px] text-emerald-800">
              Trust &amp; Safety acknowledges within 4 business hours. You can
              track the status from Support &amp; Safety → My reports.
            </p>
            {severity === "immediate_danger" && (
              <p className="mt-2 text-[13px] font-semibold text-rose-800">
                We&rsquo;ve also raised an SOS alert on your behalf. If you are
                in immediate danger, dial 999 (UK) or 911 (US).
              </p>
            )}
          </div>
          <Button block onClick={() => router.replace("/m/support")}>
            Back to Support
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-32">
      <TopBar title="Report issue" back="/m/support" />
      <div className="px-5 pt-3 space-y-3">
        <p className="text-[12px] text-subheading">
          Describe what happened. We acknowledge every report and review
          promptly.
        </p>

        <label className="block">
          <span className="block text-[13px] font-semibold text-heading mb-1">
            Type
          </span>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as SafetyReportType)}
            className="w-full rounded-lg border border-line px-3 py-2 text-[13px]"
          >
            {SAFETY_REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {SAFETY_REPORT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-[13px] font-semibold text-heading mb-1">
            Severity
          </span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as SafetySeverity)}
            className="w-full rounded-lg border border-line px-3 py-2 text-[13px]"
          >
            {SAFETY_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SAFETY_SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
          {severity === "immediate_danger" && (
            <p className="mt-1 text-[11.5px] text-rose-800">
              ⚠ This will also raise an SOS alert. Dial 999 / 911 first if you
              are in immediate danger.
            </p>
          )}
        </label>

        <TextArea
          label="What happened?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
          rows={6}
          placeholder="Be specific. Include dates, times, and any witnesses or evidence we should know about."
          hint={`${description.trim().length} / 5000 (min 10)`}
        />

        {err && (
          <p aria-live="polite" className="text-[12px] text-rose-700">
            {err}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block disabled={!ok || busy} onClick={submit}>
          {busy ? "Filing…" : "File report"}
        </Button>
      </div>
    </div>
  );
}
