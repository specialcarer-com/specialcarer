"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  TopBar,
  Avatar,
  Tag,
  Button,
  IconPin,
  IconClock,
  IconCheck,
  IconChatBubble,
} from "../../_components/ui";
import { getJob, SERVICE_LABEL } from "../../_lib/mock";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const job = getJob(params.id);
  const [applied, setApplied] = useState(job?.status === "Applied");

  if (!job) {
    return (
      <div className="min-h-screen bg-bg-screen p-6">
        <p className="text-sm text-subheading">Job not found.</p>
        <button
          onClick={() => router.push("/m/jobs")}
          className="mt-4 text-sm font-medium text-primary"
        >
          Back to jobs
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-32">
      <TopBar title="Job description" back="/m/jobs" />

      <div className="px-5 pt-2">
        <div className="rounded-card bg-white p-4 shadow-card">
          <div className="flex items-start gap-3">
            <Avatar src={job.postedAvatar} name={job.postedBy} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-subheading">{job.postedBy} · {job.postedAgo}</p>
              <h1 className="mt-1 text-[18px] font-bold leading-snug text-heading">
                {job.title}
              </h1>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Rate" value={`£${job.hourly.gbp} · $${job.hourly.usd}`} />
            <Stat label="Hours" value={job.hoursPerWeek} />
            <Stat label="Start" value={job.startDate} />
            <Stat label="Service" value={SERVICE_LABEL[job.service]} />
          </div>

          <div className="mt-4 flex items-center gap-2 text-[13px] text-subheading">
            <IconPin /> {job.city}
          </div>
        </div>

        <section className="mt-5">
          <h2 className="mb-2 text-[15px] font-bold text-heading">About this job</h2>
          <p className="text-[14px] leading-relaxed text-subheading">
            {job.description}
          </p>
        </section>

        <section className="mt-5">
          <h2 className="mb-2 text-[15px] font-bold text-heading">Requirements</h2>
          <ul className="flex flex-col gap-2">
            {job.requirements.map((r) => (
              <li
                key={r}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-50 text-primary">
                  <IconCheck />
                </span>
                <span className="text-[14px] text-heading">{r}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5">
          <h2 className="mb-2 text-[15px] font-bold text-heading">Status</h2>
          <Tag tone={job.status === "Open" ? "green" : job.status === "Applied" ? "primary" : "neutral"}>
            {job.status}
          </Tag>
        </section>
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/m/chat")}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-btn bg-primary-50 text-primary"
            aria-label="Message"
          >
            <IconChatBubble />
          </button>
          <Button
            block
            disabled={applied}
            onClick={() => setApplied(true)}
          >
            {applied ? "Applied" : "Apply now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted p-3">
      <p className="text-[11px] uppercase tracking-wide text-subheading">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-heading">{value}</p>
    </div>
  );
}
